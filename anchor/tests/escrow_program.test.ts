import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { EscrowProgram } from '../target/types/escrow_program'
import { randomBytes } from 'crypto'
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'

describe('Escrow', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const wallet = provider.wallet as anchor.Wallet

  const program = anchor.workspace.EscrowProgram as Program<EscrowProgram>

  const maker = Keypair.generate();
  const taker = Keypair.generate();

  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;

  const seed = new anchor.BN(randomBytes(8));
  const escrow = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, 'le', 8)],
    program.programId
  )[0];

  const depositAmount = new anchor.BN(1_000_000); // 1 token A (6 decimals)
  const receiveAmount = new anchor.BN(2_000_000); // 2 tokens B (6 decimals)

  beforeAll(async () => {
    // Airdrop SOL to maker and taker
    const tx = await provider.connection.requestAirdrop(maker.publicKey, 1000000000);
    await provider.connection.confirmTransaction(tx);
    console.log(`Maker balance: ${await provider.connection.getBalance(maker.publicKey)}`);

    const tx2 = await provider.connection.requestAirdrop(taker.publicKey, 1000000000);
    await provider.connection.confirmTransaction(tx2);
    console.log(`Taker balance: ${await provider.connection.getBalance(taker.publicKey)}`);

    // Create mint A
    mintA = await createMint(
      provider.connection,
      wallet.payer,
      provider.publicKey,
      provider.publicKey,
      6
    );
    console.log("Mint A:", mintA.toBase58());

    // Create mint B
    mintB = await createMint(
      provider.connection,
      wallet.payer,
      provider.publicKey,
      provider.publicKey,
      6
    );
    console.log("Mint B:", mintB.toBase58());

    // Create associated token accounts for maker
    makerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintA,
        maker.publicKey
      )
    ).address;

    makerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintB,
        maker.publicKey
      )
    ).address;

    // Create associated token accounts for taker
    takerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintA,
        taker.publicKey
      )
    ).address;

    takerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintB,
        taker.publicKey
      )
    ).address;

    // Mint tokens to maker (mint A) and taker (mint B)
    await mintTo(
      provider.connection,
      wallet.payer,
      mintA,
      makerAtaA,
      provider.publicKey,
      10_000_000 // 10 tokens A
    );

    await mintTo(
      provider.connection,
      wallet.payer,
      mintB,
      takerAtaB,
      provider.publicKey,
      10_000_000 // 10 tokens B
    );

    console.log("Setup completed successfully");
  })

  it('make - create escrow with two mints', async () => {
    const vault = getAssociatedTokenAddressSync(
      mintA,
      escrow,
      true,
      TOKEN_PROGRAM_ID
    )

    const tx = await program.methods
      .make(seed, depositAmount, receiveAmount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow,
        vault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([maker])
      .rpc()

    console.log('Make transaction signature: ', tx);
    
    // Verify escrow account was created correctly
    const escrowAccount = await program.account.escrow.fetch(escrow);
    console.log('Escrow account:', {
      seed: escrowAccount.seed.toString(),
      maker: escrowAccount.maker.toBase58(),
      mintA: escrowAccount.mintA.toBase58(),
      mintB: escrowAccount.mintB.toBase58(),
      receive: escrowAccount.receive.toString()
    });
  })

  it('take - complete the token swap', async () => {
    const vault = getAssociatedTokenAddressSync(
      mintA,
      escrow,
      true,
      TOKEN_PROGRAM_ID,
    );

    const tx = await program.methods
      .take()
      .accountsPartial({ 
        maker: maker.publicKey,
        taker: taker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        escrow,
        vault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([taker])
      .rpc()

    console.log('Take transaction signature: ', tx);
    
    // Verify the swap was completed
    console.log('Swap completed successfully');
  })

  // Alternative test for refund scenario
  it('make and refund - test refund functionality', async () => {
    // Create new escrow for refund test
    const refundSeed = new anchor.BN(randomBytes(8));
    const refundEscrow = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), refundSeed.toArrayLike(Buffer, 'le', 8)],
      program.programId
    )[0];

    const refundVault = getAssociatedTokenAddressSync(
      mintA,
      refundEscrow,
      true,
      TOKEN_PROGRAM_ID
    )

    // Create escrow
    const makeTx = await program.methods
      .make(refundSeed, depositAmount, receiveAmount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: refundEscrow,
        vault: refundVault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([maker])
      .rpc()

    console.log('Make (for refund) transaction signature: ', makeTx);

    // Refund the escrow
    const refundTx = await program.methods
      .refund()
      .accountsPartial({ 
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: refundEscrow,
        vault: refundVault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([maker])
      .rpc()

    console.log('Refund transaction signature: ', refundTx);
    console.log('Refund completed successfully');
  })
})