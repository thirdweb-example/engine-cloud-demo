import express from "express";
import cors from "cors";
import "dotenv/config";

// Import dependencies for traditional approach
import {
  createThirdwebClient,
  getContract,
  sendTransaction,
  waitForReceipt,
  estimateGasCost,
  toEther,
  type PreparedTransaction,
} from "thirdweb";
import { arbitrumSepolia } from "thirdweb/chains";
import { claimTo } from "thirdweb/extensions/erc1155";
import { privateKeyToAccount } from "thirdweb/wallets";

// Import dependencies for Engine approach
import { Engine } from "thirdweb";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Create a thirdweb client
const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY || "",
});

// Create a server wallet for Engine
const serverWallet = Engine.serverWallet({
  client,
  address: process.env.THIRDWEB_SERVER_WALLET_ADDRESS || "",
  vaultAccessToken: process.env.THIRDWEB_VAULT_ACCESS_TOKEN || "",
});

// Define types for transaction results
interface TransactionResult {
  index: number;
  transactionHash: string;
}

interface EngineTransactionResult {
  index: number;
  transactionId: string;
}

// Traditional Approach Endpoint
app.post("/traditional", async (req, res) => {
  const overallStartTime = Date.now();
  try {
    const { numTransactions = 1 } = req.body;

    console.log(
      `Starting batch transaction processing (traditional approach) for ${numTransactions} transactions...`
    );

    const account = privateKeyToAccount({
      client,
      privateKey: process.env.THIRDWEB_WALLET_PRIVATE_KEY || "",
    });

    console.log(`Using Wallet Address: ${account.address}`);

    const contract = getContract({
      client,
      chain: arbitrumSepolia,
      address: process.env.THIRDWEB_DEPLOYED_CONTRACT_ADDRESS || "",
    });

    // 1. Prepare all transaction objects and estimate gas costs concurrently
    const transactionsToEstimate: PreparedTransaction<any>[] = [];
    for (let i = 0; i < numTransactions; i++) {
      transactionsToEstimate.push(
        claimTo({
          contract,
          to: account.address,
          tokenId: 0n,
          quantity: 1n,
        })
      );
    }

    console.log(
      `Estimating gas for ${numTransactions} transactions (traditional)...`
    );
    const gasCostPromises = transactionsToEstimate.map((tx) =>
      estimateGasCost({ transaction: tx })
    );
    const gasCostResults = await Promise.all(gasCostPromises);

    let totalEstimatedGasWei = 0n;
    gasCostResults.forEach((cost) => {
      totalEstimatedGasWei += cost.wei;
    });
    const totalEstimatedGasEth = toEther(totalEstimatedGasWei);
    const avgEstimatedGasPerTxEth =
      numTransactions > 0
        ? parseFloat(totalEstimatedGasEth) / numTransactions
        : 0;
    console.log(`Total estimated gas: ${totalEstimatedGasEth} ETH`);

    // 2. Send all transactions concurrently
    const transactionPromises: Promise<TransactionResult>[] = [];
    const timeToGetHashesStart = Date.now();

    for (let i = 0; i < numTransactions; i++) {
      // Use the already prepared transaction object from transactionsToEstimate
      const transaction = transactionsToEstimate[i];
      const promise = sendTransaction({
        transaction,
        account,
      })
        .then((result) => {
          console.log(
            `Traditional Tx #${i + 1} hash received: ${result.transactionHash}`
          );
          return {
            index: i + 1,
            transactionHash: result.transactionHash,
          };
        })
        .catch((err) => {
          console.error(`Error sending Tx #${i + 1} (traditional):`, err);
          return { index: i + 1, transactionHash: "SEND_ERROR" };
        });
      transactionPromises.push(promise);
    }

    console.log(
      `Waiting for ${numTransactions} transaction hashes (traditional)...`
    );
    const resultsWithHashes = await Promise.all(transactionPromises);
    const validResultsWithHashes = resultsWithHashes.filter(
      (r) => r.transactionHash !== "SEND_ERROR"
    );
    const timeToGetAllHashesSeconds =
      (Date.now() - timeToGetHashesStart) / 1000;
    console.log(
      `All ${
        validResultsWithHashes.length
      } of ${numTransactions} transaction hashes received in ${timeToGetAllHashesSeconds.toFixed(
        3
      )}s.`
    );

    // 3. Wait for the first transaction's confirmation
    let firstConfirmationTimeSeconds = 0;
    let firstTxConfirmed = false;
    let firstTxHashForConfirmation = "";

    if (validResultsWithHashes.length > 0) {
      firstTxHashForConfirmation = validResultsWithHashes[0].transactionHash;
      console.log(
        `Waiting for first transaction (${firstTxHashForConfirmation}) to be confirmed on-chain (approx 30 blocks)...`
      );
      try {
        const receiptStartTime = Date.now();
        await waitForReceipt({
          client,
          chain: arbitrumSepolia,
          transactionHash: firstTxHashForConfirmation as `0x${string}`,
          maxBlocksWaitTime: 30,
        });
        firstConfirmationTimeSeconds = (Date.now() - receiptStartTime) / 1000;
        firstTxConfirmed = true;
        console.log(
          `First transaction confirmed in ${firstConfirmationTimeSeconds.toFixed(
            3
          )}s.`
        );
      } catch (receiptError) {
        console.warn(
          `Timeout or error waiting for first transaction receipt: ${
            receiptError instanceof Error ? receiptError.message : receiptError
          }`
        );
      }
    }

    const overallEndTime = Date.now();
    const overallTotalTimeSeconds = (overallEndTime - overallStartTime) / 1000;
    const avgTimePerTxGettingHashesMs =
      validResultsWithHashes.length > 0
        ? (timeToGetAllHashesSeconds * 1000) / validResultsWithHashes.length
        : 0;

    console.log(
      `Traditional approach fully completed in ${overallTotalTimeSeconds.toFixed(
        3
      )}s.`
    );

    res.json({
      success: true,
      transactions: validResultsWithHashes,
      metrics: {
        overallTotalTimeSeconds: overallTotalTimeSeconds,
        timeToGetAllHashesSeconds: timeToGetAllHashesSeconds,
        avgTimePerTxGettingHashesMs: avgTimePerTxGettingHashesMs,
        firstTxConfirmationDetails: {
          transactionHash: firstTxHashForConfirmation,
          confirmed: firstTxConfirmed,
          timeToConfirmSeconds: firstConfirmationTimeSeconds,
        },
        estimatedGas: {
          totalEth: totalEstimatedGasEth,
          avgPerTxEth: avgEstimatedGasPerTxEth.toFixed(8), // Format for display
        },
        numTransactionsAttempted: numTransactions,
        numTransactionsSent: validResultsWithHashes.length,
      },
    });
  } catch (error) {
    console.error("Error in traditional approach:", error);
    const overallTotalTimeSeconds = (Date.now() - overallStartTime) / 1000;
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      metrics: { overallTotalTimeSeconds },
    });
  }
});

// Engine Approach Endpoint
app.post("/engine", async (req, res) => {
  const overallStartTime = Date.now();
  try {
    const { numTransactions = 1 } = req.body;
    console.log(
      `Starting batch transaction processing (Engine approach) for ${numTransactions} transactions...`
    );

    const prepareTransaction = () => {
      return claimTo({
        contract: getContract({
          client,
          address: process.env.THIRDWEB_DEPLOYED_CONTRACT_ADDRESS || "",
          chain: arbitrumSepolia,
        }),
        to: process.env.THIRDWEB_USER_WALLET_ADDRESS || "",
        tokenId: 0n,
        quantity: 1n,
      });
    };

    const transactionPromises: Promise<EngineTransactionResult>[] = [];

    // Add timing specifically for the transaction queueing part, similar to traditional approach
    const timeToQueueStart = Date.now();

    for (let i = 0; i < numTransactions; i++) {
      const transaction = prepareTransaction();
      const promise = serverWallet
        .enqueueTransaction({
          transaction,
        })
        .then((result) => {
          console.log(
            `Engine Tx #${i + 1} enqueued, ID: ${result.transactionId}`
          );
          return {
            index: i + 1,
            transactionId: result.transactionId,
          };
        })
        .catch((err) => {
          console.error(`Error enqueuing Tx #${i + 1} with Engine:`, err);
          return { index: i + 1, transactionId: "ENQUEUE_ERROR" };
        });
      transactionPromises.push(promise);
    }

    console.log(`Waiting for ${numTransactions} Engine transaction IDs...`);
    const resultsWithIds = await Promise.all(transactionPromises);
    const validResultsWithIds = resultsWithIds.filter(
      (r) => r.transactionId !== "ENQUEUE_ERROR"
    );
    const timeToQueueAllSeconds = (Date.now() - timeToQueueStart) / 1000;
    const overallEndTime = Date.now();

    const overallTotalTimeSeconds = (overallEndTime - overallStartTime) / 1000;
    const avgTimePerTxQueuingMs =
      validResultsWithIds.length > 0
        ? (timeToQueueAllSeconds * 1000) / validResultsWithIds.length
        : 0;

    console.log(
      `Engine approach completed (all tx enqueued) in ${overallTotalTimeSeconds.toFixed(
        3
      )}s (pure queueing time: ${timeToQueueAllSeconds.toFixed(3)}s).`
    );

    res.json({
      success: true,
      transactions: validResultsWithIds,
      metrics: {
        overallTotalTimeSeconds: overallTotalTimeSeconds,
        timeToQueueAllSeconds: timeToQueueAllSeconds,
        avgTimePerTxQueuingMs: avgTimePerTxQueuingMs,
        estimatedGas: {
          totalEth: "0",
          avgPerTxEth: "0",
          note: "Gas sponsored by Engine",
        },
        numTransactionsAttempted: numTransactions,
        numTransactionsEnqueued: validResultsWithIds.length,
      },
    });
  } catch (error) {
    console.error("Error in Engine approach:", error);
    const overallTotalTimeSeconds = (Date.now() - overallStartTime) / 1000;
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      metrics: { overallTotalTimeSeconds },
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
