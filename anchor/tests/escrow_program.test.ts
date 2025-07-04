import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { EscrowProgram } from '../target/types/escrow_program'
import { randomBytes } from 'crypto'
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'

describe('Escrow Program', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const wallet = provider.wallet as anchor.Wallet

  const program = anchor.workspace.EscrowProgram as Program<EscrowProgram>

  // Test accounts
  const maker = Keypair.generate()
  const taker = Keypair.generate()

  // Mint and token account variables
  let mintA: PublicKey
  let mintB: PublicKey
  let makerAtaA: PublicKey
  let makerAtaB: PublicKey
  let takerAtaA: PublicKey
  let takerAtaB: PublicKey

  // Test amounts
  const depositAmount = new anchor.BN(1_000_000) // 1 token A (6 decimals)
  const receiveAmount = new anchor.BN(2_000_000) // 2 tokens B (6 decimals)

  beforeAll(async () => {
    console.log('Setting up test environment...')
    
    // Airdrop SOL to test accounts
    await Promise.all([
      provider.connection.requestAirdrop(maker.publicKey, 2_000_000_000),
      provider.connection.requestAirdrop(taker.publicKey, 2_000_000_000)
    ])

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000))

    console.log(`Maker balance: ${await provider.connection.getBalance(maker.publicKey)} lamports`)
    console.log(`Taker balance: ${await provider.connection.getBalance(taker.publicKey)} lamports`)

    // Create mints
    mintA = await createMint(
      provider.connection,
      wallet.payer,
      provider.publicKey,
      provider.publicKey,
      6
    )
    console.log("Mint A:", mintA.toBase58())

    mintB = await createMint(
      provider.connection,
      wallet.payer,
      provider.publicKey,
      provider.publicKey,
      6
    )
    console.log("Mint B:", mintB.toBase58())

    // Create associated token accounts
    const [makerAtaAAccount, makerAtaBAccount, takerAtaAAccount, takerAtaBAccount] = await Promise.all([
      getOrCreateAssociatedTokenAccount(provider.connection, wallet.payer, mintA, maker.publicKey),
      getOrCreateAssociatedTokenAccount(provider.connection, wallet.payer, mintB, maker.publicKey),
      getOrCreateAssociatedTokenAccount(provider.connection, wallet.payer, mintA, taker.publicKey),
      getOrCreateAssociatedTokenAccount(provider.connection, wallet.payer, mintB, taker.publicKey)
    ])

    makerAtaA = makerAtaAAccount.address
    makerAtaB = makerAtaBAccount.address
    takerAtaA = takerAtaAAccount.address
    takerAtaB = takerAtaBAccount.address

    // Mint tokens to accounts
    await Promise.all([
      mintTo(provider.connection, wallet.payer, mintA, makerAtaA, provider.publicKey, 10_000_000), // 10 tokens A to maker
      mintTo(provider.connection, wallet.payer, mintB, takerAtaB, provider.publicKey, 10_000_000)  // 10 tokens B to taker
    ])

    console.log("Setup completed successfully")
  })

  describe('Make Escrow', () => {
    let seed: anchor.BN
    let escrow: PublicKey
    let vault: PublicKey

    beforeEach(() => {
      seed = new anchor.BN(randomBytes(8))
      escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0]
      vault = getAssociatedTokenAddressSync(mintA, escrow, true, TOKEN_PROGRAM_ID)
    })

    it('should create escrow successfully', async () => {
      const makerBalanceBefore = await getAccount(provider.connection, makerAtaA)
      
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

      console.log('Make transaction signature:', tx)
      
      // Verify escrow account was created correctly
      const escrowAccount = await program.account.escrow.fetch(escrow)
      expect(escrowAccount.seed.toString()).toEqual(seed.toString())
      expect(escrowAccount.maker.toBase58()).toEqual(maker.publicKey.toBase58())
      expect(escrowAccount.mintA.toBase58()).toEqual(mintA.toBase58())
      expect(escrowAccount.mintB.toBase58()).toEqual(mintB.toBase58())
      expect(escrowAccount.deposit.toString()).toEqual(depositAmount.toString())
      expect(escrowAccount.receive.toString()).toEqual(receiveAmount.toString())

      // Verify tokens were transferred to vault
      const vaultAccount = await getAccount(provider.connection, vault)
      expect(vaultAccount.amount.toString()).toEqual(depositAmount.toString())

      // Verify maker's balance decreased
      const makerBalanceAfter = await getAccount(provider.connection, makerAtaA)
      expect(makerBalanceAfter.amount).toEqual(makerBalanceBefore.amount - BigInt(depositAmount.toString()))
    })
  })

  describe('Take Escrow', () => {
    let seed: anchor.BN
    let escrow: PublicKey
    let vault: PublicKey

    beforeEach(async () => {
      seed = new anchor.BN(randomBytes(8))
      escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0]
      vault = getAssociatedTokenAddressSync(mintA, escrow, true, TOKEN_PROGRAM_ID)

      // Create escrow first
      await program.methods
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
    })

    it('should complete token swap successfully', async () => {
      const takerBalanceBBefore = await getAccount(provider.connection, takerAtaB)
      const makerBalanceABefore = await getAccount(provider.connection, makerAtaA)

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

      console.log('Take transaction signature:', tx)
      
      // Verify escrow account was closed
      try {
        await program.account.escrow.fetch(escrow)
        expect('Escrow account should have been closed') // fail
      } catch (error) {
        expect(error).toContain('Account does not exist')
      }

      // Verify taker received tokens A
      const takerBalanceAAfter = await getAccount(provider.connection, takerAtaA)
      expect(takerBalanceAAfter.amount.toString()).toEqual(depositAmount.toString())

      // Verify taker's token B balance decreased
      const takerBalanceBAfter = await getAccount(provider.connection, takerAtaB)
      expect(takerBalanceBAfter.amount).toEqual(takerBalanceBBefore.amount - BigInt(receiveAmount.toString()))

      // Verify maker received tokens B
      const makerBalanceBAfter = await getAccount(provider.connection, makerAtaB)
      expect(makerBalanceBAfter.amount.toString()).toEqual(receiveAmount.toString())
    })

  })

  describe('Refund Escrow', () => {
    let seed: anchor.BN
    let escrow: PublicKey
    let vault: PublicKey

    beforeEach(async () => {
      seed = new anchor.BN(randomBytes(8))
      escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0]
      vault = getAssociatedTokenAddressSync(mintA, escrow, true, TOKEN_PROGRAM_ID)

      // Create escrow first
      await program.methods
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
    })

    it('should refund tokens successfully', async () => {
      const makerBalanceBefore = await getAccount(provider.connection, makerAtaA)

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

      console.log('Refund transaction signature:', tx)
      
      // Verify escrow account was closed
      try {
        await program.account.escrow.fetch(escrow)
        expect('Escrow account should have been closed')
      } catch (error) {
        console.log(error)
        expect(error).toContain('Account does not exist')
      }

      // Verify maker got their tokens back
      const makerBalanceAfter = await getAccount(provider.connection, makerAtaA)
      expect(makerBalanceAfter.amount).toEqual(makerBalanceBefore.amount + BigInt(depositAmount.toString()))
    })
  })
})