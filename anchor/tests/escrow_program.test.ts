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

  const counterKeypair = Keypair.generate()

  const maker = Keypair.generate();
  const taker = Keypair.generate();

  let mintA: PublicKey;
  let makerAtaA: PublicKey;
  let takerAtaA: PublicKey;

  const seed = new anchor.BN(randomBytes(8));
  const escrow = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, 'le', 8)],
    program.programId
  )[0];

  beforeAll(async ()=> {
    const tx = await provider.connection.requestAirdrop(maker.publicKey, 1000000000);
    await provider.connection.confirmTransaction(tx);
    console.log(`Maker balance: ${await provider.connection.getBalance(maker.publicKey)}`);

    const tx2 = await provider.connection.requestAirdrop(taker.publicKey, 1000000000);
    await provider.connection.confirmTransaction(tx2);
    console.log(`Taker balance: ${await provider.connection.getBalance(taker.publicKey)}`);

    mintA = await createMint(
      provider.connection,
      wallet.payer,
      provider.publicKey,
      provider.publicKey,
      6
    );
    console.log("Mint A:", mintA.toBase58());

    makerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintA,
        maker.publicKey
      )
    ).address;

    takerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintA,
        taker.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      wallet.payer,
      mintA,
      makerAtaA,
      provider.publicKey,
      1_000_000_0
    );

    await mintTo(
      provider.connection,
      wallet.payer,
      mintA,
      takerAtaA,
      provider.publicKey,
      1_000_000_0
    );
  })

  it('make', async () => {
    const vault = getAssociatedTokenAddressSync(
      mintA,
      escrow,
      true,
      TOKEN_PROGRAM_ID
    )

    const tx = await program.methods
      .make(seed, new anchor.BN(1_000_000))
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow,
        vault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([maker])
      .rpc()

    console.log('You transaction signature: ', tx);
  })

  it('refund', async () => {
    const vault = getAssociatedTokenAddressSync(
      mintA,
      escrow,
      true,
      TOKEN_PROGRAM_ID,
    );

    const tx = await program.methods
      .refund()
      .accountsPartial({ 
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow,
        vault,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .signers([maker])
      .rpc()

      console.log('You transaction signature: ', tx);
  })

  it('taker', async () => {
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
          escrow,
          vault,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
      .signers([taker])
      .rpc()

      console.log('You transaction signature: ', tx);
  })

})
