'use client'

import { getEscrowProgram, getEscrowProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, PublicKey, SystemProgram } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { BN } from 'bn.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'

interface MakeArgs {
  seed: number, 
  deposit: number,
  receive: number,
  maker: PublicKey, 
  mintA: PublicKey,
  mintB: PublicKey
}

interface RefundArgs {
  seed: number, 
  maker: PublicKey, 
  mintA: PublicKey
}

interface TakeArgs {
  taker: PublicKey
}

export function useEscrowProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getEscrowProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getEscrowProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['escrow', 'all', { cluster }],
    queryFn: async () => {
      try {
        // First try the normal approach
        const allAccounts = await program.account.escrow.all();
        return allAccounts;
      } catch (error) {
        console.warn('Failed to fetch all accounts at once, trying individual fetch approach:', error);
        
        try {
          // Fallback: Get program accounts and decode individually
          const programAccounts = await connection.getProgramAccounts(programId);
          console.log(`Found ${programAccounts.length} program accounts`);
          
          const validAccounts = [];
          const corruptedAccounts = [];
          
          for (const { pubkey, account } of programAccounts) {
            try {
              // Try to decode the account data
              const decoded = program.coder.accounts.decode('escrow', account.data);
              validAccounts.push({ 
                publicKey: pubkey, 
                account: decoded 
              });
            } catch (decodeError) {
              console.warn(`Skipping corrupted account ${pubkey.toString()}:`, decodeError);
              corruptedAccounts.push({
                pubkey: pubkey.toString(),
                dataLength: account.data.length,
                owner: account.owner.toString()
              });
            }
          }
          
          if (corruptedAccounts.length > 0) {
            console.warn(`Found ${corruptedAccounts.length} corrupted accounts:`, corruptedAccounts);
            toast.warning(`Found ${corruptedAccounts.length} corrupted escrow accounts that will be skipped`);
          }
          
          console.log(`Successfully decoded ${validAccounts.length} valid accounts`);
          return validAccounts;
          
        } catch (fallbackError) {
          console.error('Fallback approach also failed:', fallbackError);
          toast.error('Failed to fetch escrow accounts');
          return [];
        }
      }
    },
    retry: 1,
    retryDelay: 1000,
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const make = useMutation<string, Error, MakeArgs>({
    mutationKey: ['make', 'initialize', { cluster }],
    mutationFn: async ({ seed, deposit, receive, maker, mintA, mintB }) => {

      const makerAtaA = getAssociatedTokenAddressSync(mintA, maker);

      const escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBuffer(), new BN(seed).toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0];

      const vault = getAssociatedTokenAddressSync(
        mintA,
        escrow,
        true,
        TOKEN_PROGRAM_ID
      )

      return await program.methods
        .make(new BN(seed), new BN(deposit), new BN(receive))
        .accountsPartial({ 
          maker,
          mintA,
          mintB,
          makerAtaA,
          escrow,
          vault,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await accounts.refetch()
    },
    onError: () => {
      toast.error('Failed to make escrow')
    },
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    make,
  }
}

export function useEscrowProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program, accounts } = useEscrowProgram()

  const accountQuery = useQuery({
    queryKey: ['escrow', 'fetch', { cluster, account }],
    queryFn: () => program.account.escrow.fetch(account),
  })

  const refund = useMutation<string, Error, RefundArgs>({
    mutationKey: ['escrow', 'refund', { cluster, account }],
    mutationFn: async({ seed, maker, mintA }) => {
      const makerAtaA = getAssociatedTokenAddressSync(mintA, maker);

      const escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBuffer(), new BN(seed).toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0];

      const vault = getAssociatedTokenAddressSync(
        mintA,
        escrow,
        true,
        TOKEN_PROGRAM_ID
      )

      return await program.methods
        .refund()
        .accountsPartial({ 
          maker,
          mintA,
          makerAtaA,
          escrow,
          vault,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId 
        })
        .rpc()
    },
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accounts.refetch()
    },
    onError: () => {
      toast.error('Failed to refund escrow')
    }
  })

  const take = useMutation<string, Error, TakeArgs>({
    mutationKey: ['escrow', 'take', { cluster, account }],
    mutationFn: async({ taker }) => {
      const escrowPda = await program.account.escrow.fetch(account);
      const maker = escrowPda.maker;
      const mintA = escrowPda.mintA;
      const mintB = escrowPda.mintB;
      
      const takerAtaA = getAssociatedTokenAddressSync(mintA, taker);
      const takerAtaB = getAssociatedTokenAddressSync(mintB, taker);
      const makerAtaB = getAssociatedTokenAddressSync(mintB, maker);
      
      const escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.toBuffer(), new BN(escrowPda.seed).toArrayLike(Buffer, 'le', 8)],
        program.programId
      )[0];

      const vault = getAssociatedTokenAddressSync(
        mintA,
        escrow,
        true,
        TOKEN_PROGRAM_ID
      )

      return await program.methods
        .take()
        .accountsPartial({
          taker, 
          maker,
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
        .rpc()
    },
    onSuccess: async (tx) => {
      transactionToast(tx)
      await accounts.refetch()
    },
    onError: () => {
      toast.error('Failed to take escrow')
    }
  })

  return {
    accountQuery,
    take,
    refund
  }
}