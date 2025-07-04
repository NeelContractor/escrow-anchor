"use client"

import { WalletButton } from "../solana/solana-provider";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { useEscrowProgram, useEscrowProgramAccount } from "./escrow-data-access";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, ArrowRightLeft } from "lucide-react";
import { BN } from "@coral-xyz/anchor";
import { getMint, Mint } from "@solana/spl-token";

export default function Escrow() {
    const { publicKey } = useWallet();
    const { make, accounts } = useEscrowProgram();
    
    // Form states
    const [mintA, setMintA] = useState("");
    const [mintB, setMintB] = useState("");
    const [depositAmount, setDepositAmount] = useState("");
    const [receiveAmount, setReceiveAmount] = useState("");
    const [seed, setSeed] = useState("");

    const handleMakeEscrow = async () => {
        if (!publicKey) {
            toast.error("Please connect your wallet first");
            return;
        }

        if (!mintA || !mintB || !depositAmount || !receiveAmount || !seed) {
            toast.error("Please fill in all fields");
            return;
        }

        try {
            await make.mutateAsync({
                seed: parseInt(seed),
                deposit: parseFloat(depositAmount) * 1_000_000, // Convert to token units
                receive: parseFloat(receiveAmount) * 1_000_000,
                maker: publicKey,
                mintA: new PublicKey(mintA),
                mintB: new PublicKey(mintB)
            });
            
            // Clear form
            setMintA("");
            setMintB("");
            setDepositAmount("");
            setReceiveAmount("");
            setSeed("");
            
            toast.success("Escrow created successfully!");
        } catch (error) {
            console.error("Error creating escrow:", error);
        }
    };

    const generateRandomSeed = () => {
        const randomSeed = Math.floor(Math.random() * 1000000);
        setSeed(randomSeed.toString());
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Escrow Anchor
                </h1>
                <WalletButton />
            </div>

            {/* Description */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5" />
                        How It Works
                    </CardTitle>
                    <CardDescription>
                        Create atomic token swaps between two different SPL tokens. The maker deposits Token A and specifies how much Token B they want in return. A taker can complete the swap by providing Token B and receiving Token A.
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Make Escrow Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Create Escrow</CardTitle>
                        <CardDescription>
                            Set up a new token swap escrow
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Deposit Token (Mint A)</label>
                            <Input 
                                placeholder="e.g., So11111111111111111111111111111111111111112"
                                value={mintA}
                                onChange={(e) => setMintA(e.target.value)}
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Receive Token (Mint B)</label>
                            <Input 
                                placeholder="e.g., EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                                value={mintB}
                                onChange={(e) => setMintB(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Deposit Amount</label>
                                <Input 
                                    placeholder="1.0"
                                    type="number"
                                    step="0.000001"
                                    value={depositAmount}
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Receive Amount</label>
                                <Input 
                                    placeholder="2.0"
                                    type="number"
                                    step="0.000001"
                                    value={receiveAmount}
                                    onChange={(e) => setReceiveAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Seed</label>
                            <div className="flex gap-2">
                                <Input 
                                    placeholder="123456"
                                    value={seed}
                                    onChange={(e) => setSeed(e.target.value)}
                                />
                                <Button 
                                    variant="outline" 
                                    onClick={generateRandomSeed}
                                    className="px-3"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <Button 
                            onClick={handleMakeEscrow}
                            disabled={make.isPending || !publicKey}
                            className="w-full"
                        >
                            {make.isPending ? "Creating..." : "Create Escrow"}
                        </Button>
                    </CardContent>
                </Card>

                {/* Active Escrows */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            Active Escrows
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => accounts.refetch()}
                                disabled={accounts.isFetching}
                            >
                                <RefreshCw className={`h-4 w-4 ${accounts.isFetching ? 'animate-spin' : ''}`} />
                            </Button>
                        </CardTitle>
                        <CardDescription>
                            All active escrow accounts
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {accounts.isLoading ? (
                            <div className="flex items-center justify-center p-8">
                                <RefreshCw className="h-6 w-6 animate-spin" />
                            </div>
                        ) : accounts.data?.length === 0 ? (
                            <div className="text-center text-muted-foreground p-8">
                                No active escrows found
                            </div>
                        ) : (
                            <div className="space-y-4"> 
                                {accounts.data?.map((escrow) => (
                                    <EscrowCard key={escrow.publicKey.toString()} escrowPubkey={escrow.publicKey} escrowAcc={escrow.account} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

interface EscrowAccType {
    seed: BN;
    maker: PublicKey;
    mintA: PublicKey;
    mintB: PublicKey;
    deposit: BN;
    receive: BN;
    bump: number;

}

function EscrowCard({ escrowPubkey, escrowAcc }: { escrowPubkey: PublicKey, escrowAcc: EscrowAccType }) {
    const { publicKey } = useWallet();
    // const { program } = useEscrowProgram();
    const { take, refund } = useEscrowProgramAccount({ account: escrowPubkey });
    const { connection } = useConnection();

    // State for mint data
    const [mintAData, setMintAData] = useState<Mint | null>(null);
    const [mintBData, setMintBData] = useState<Mint | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMintData = async () => {
            try {
                const [mintAResult, mintBResult] = await Promise.all([
                    getMint(connection, escrowAcc.mintA),
                    getMint(connection, escrowAcc.mintB)
                ]);
                setMintAData(mintAResult);
                setMintBData(mintBResult);
            } catch (error) {
                console.error("Error fetching mint data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchMintData();
    }, [connection, escrowAcc.mintA, escrowAcc.mintB]);

    // const escrowPda = PublicKey.findProgramAddressSync(
    //     [Buffer.from("escrow"), escrowAcc.maker.toBuffer(), new BN(escrowAcc.seed).toArrayLike(Buffer, 'le', 8)],
    //     program.programId
    // )[0];

    // const vault = getAssociatedTokenAddressSync(
    //     escrowAcc.mintA,
    //     escrowPda,
    //     true,
    //     TOKEN_PROGRAM_ID
    // );
    
    const isOwner = publicKey?.equals(escrowAcc.maker);
    
    // Calculate amounts with proper decimals
    const depositAmount = mintAData 
        ? (escrowAcc.deposit.toNumber() || 0) / Math.pow(10, mintAData.decimals)
        : 0;
    const receiveAmount = mintBData 
        ? escrowAcc.receive.toNumber() / Math.pow(10, mintBData.decimals)
        : 0;

    const handleTake = async () => {
        if (!publicKey) {
            toast.error("Please connect your wallet first");
            return;
        }

        try {
            await take.mutateAsync({ taker: publicKey });
            toast.success("Escrow taken successfully!");
        } catch (error) {
            console.error("Error taking escrow:", error);
        }
    };

    const handleRefund = async () => {
        if (!publicKey) {
            toast.error("Please connect your wallet first");
            return;
        }

        try {
            await refund.mutateAsync({
                seed: escrowAcc.seed.toNumber(),
                maker: escrowAcc.maker,
                mintA: escrowAcc.mintA
            });
            toast.success("Escrow refunded successfully!");
        } catch (error) {
            console.error("Error refunding escrow:", error);
        }
    };

    if (loading) {
        return (
            <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                    <div className="flex items-center justify-center">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span className="ml-2">Loading escrow data...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <Badge variant={isOwner ? "default" : "secondary"}>
                        {isOwner ? "Your Escrow" : "Available"}
                    </Badge>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Seed: {escrowAcc.seed.toString()}</span>
                        <ExternalLink className="h-3 w-3" />
                    </div>
                </div>

                <div className="space-y-2 mb-4">
                    <div className="grid gap-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Offering:</span>
                            <span className="text-sm">{depositAmount} Token A</span>
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                            {mintAData?.address.toBase58()}
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Wants:</span>
                            <span className="text-sm">{receiveAmount} Token B</span>
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                            {mintBData?.address.toBase58()}
                        </div>
                    </div>
                </div>

                <Separator className="mb-4" />

                <div className="flex gap-2">
                    {isOwner ? (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleRefund}
                            disabled={refund.isPending}
                            className="flex-1"
                        >
                            {refund.isPending ? "Refunding..." : "Refund"}
                        </Button>
                    ) : (
                        <Button 
                            size="sm"
                            onClick={handleTake}
                            disabled={take.isPending}
                            className="flex-1"
                        >
                            {take.isPending ? "Taking..." : "Take Escrow"}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// async function EscrowCard({ escrowPubkey, escrowAcc }: { escrowPubkey: PublicKey, escrowAcc: EscrowAccType }) {
//     const { publicKey } = useWallet();
//     const { program } = useEscrowProgram();
//     const { take, refund } = useEscrowProgramAccount({ account: escrowPubkey });
//     const { connection } = useConnection();

//     const allescrowaccs = program.account.escrow.all();
//     console.log(allescrowaccs);

//     const escrowPda = PublicKey.findProgramAddressSync(
//         [Buffer.from("escrow"), escrowAcc.maker.toBuffer(), new BN(escrowAcc.seed).toArrayLike(Buffer, 'le', 8)],
//         program.programId
//     )[0];

//     const vault = getAssociatedTokenAddressSync(
//         escrowAcc.mintA,
//         escrowPda,
//         true,
//         TOKEN_PROGRAM_ID
//     )

//     const mintAData = await getMint(
//         connection,
//         escrowAcc.mintA
//     )

//     const mintBData = await getMint(
//         connection,
//         escrowAcc.mintB
//     )
    
//     const isOwner = publicKey?.equals(escrowAcc.maker);
//     const depositAmount = (escrowAcc.deposit.toNumber() || 0) / mintAData.decimals;
//     const receiveAmount = escrowAcc.receive.toNumber() / mintBData.decimals;

//     const handleTake = async () => {
//         if (!publicKey) {
//             toast.error("Please connect your wallet first");
//             return;
//         }

//         try {
//             await take.mutateAsync({ taker: publicKey });
//             toast.success("Escrow taken successfully!");
//         } catch (error) {
//             console.error("Error taking escrow:", error);
//         }
//     };

//     const handleRefund = async () => {
//         if (!publicKey) {
//             toast.error("Please connect your wallet first");
//             return;
//         }

//         try {
//             await refund.mutateAsync({
//                 seed: escrowAcc.seed.toNumber(),
//                 maker: escrowAcc.maker,
//                 mintA: escrowAcc.mintA
//             });
//             toast.success("Escrow refunded successfully!");
//         } catch (error) {
//             console.error("Error refunding escrow:", error);
//         }
//     };

//     return (
//         <Card className="border-l-4 border-l-blue-500">
//             <CardContent className="p-4">
//                 <div className="flex items-center justify-between mb-3">
//                     <Badge variant={isOwner ? "default" : "secondary"}>
//                         {isOwner ? "Your Escrow" : "Available"}
//                     </Badge>
//                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
//                         <span>Seed: {escrowAcc.seed.toString()}</span>
//                         <ExternalLink className="h-3 w-3" />
//                     </div>
//                 </div>

//                 <div className="space-y-2 mb-4">
//                     <div className="grid gap-2">
//                         <div className="flex justify-between items-center">
//                             <span className="text-sm font-medium">Offering:</span>
//                             <span className="text-sm">{depositAmount} Token A</span>
//                         </div>
//                         <div>
//                             {mintAData.address.toBase58()}
//                         </div>
//                     </div>
//                     <div className="grid gap-2">
//                         <div className="flex justify-between items-center">
//                             <span className="text-sm font-medium">Wants:</span>
//                             <span className="text-sm">{receiveAmount} Token B</span>
//                         </div>
//                         <div>
//                             {mintBData.address.toBase58()}
//                         </div>
//                     </div>
//                 </div>

//                 <Separator className="mb-4" />

//                 <div className="flex gap-2">
//                     {isOwner ? (
//                         <Button 
//                             variant="outline" 
//                             size="sm"
//                             onClick={handleRefund}
//                             disabled={refund.isPending}
//                             className="flex-1"
//                         >
//                             {refund.isPending ? "Refunding..." : "Refund"}
//                         </Button>
//                     ) : (
//                         <Button 
//                             size="sm"
//                             onClick={handleTake}
//                             disabled={take.isPending}
//                             className="flex-1"
//                         >
//                             {take.isPending ? "Taking..." : "Take Escrow"}
//                         </Button>
//                     )}
//                 </div>
//             </CardContent>
//         </Card>
//     );
// }