// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import EscrowProgramIDL from '../target/idl/escrow_program.json'
import type { EscrowProgram } from '../target/types/escrow_program'

// Re-export the generated IDL and type
export { EscrowProgram, EscrowProgramIDL }

// The programId is imported from the program IDL.
export const ESCROW_PROGRAM_ID = new PublicKey(EscrowProgramIDL.address)

// This is a helper function to get the Counter Anchor program.
export function getEscrowProgram(provider: AnchorProvider, address?: PublicKey): Program<EscrowProgram> {
  return new Program({ ...EscrowProgramIDL, address: address ? address.toBase58() : EscrowProgramIDL.address } as EscrowProgram, provider)
}

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getEscrowProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Counter program on devnet and testnet.
      return new PublicKey('AoTepYaXFog4H7HsvxLLgcj7uHfumhD9mqVnY7r4gytf')
    case 'mainnet-beta':
    default:
      return ESCROW_PROGRAM_ID
  }
}
