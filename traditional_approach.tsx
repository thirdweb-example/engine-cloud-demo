import { createThirdwebClient, getContract, defineChain } from "thirdweb";
import { arbitrumSepolia } from "thirdweb/chains";
import { claimTo } from "thirdweb/extensions/erc1155";
import { sendTransaction } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";

import "dotenv/config";

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY || "",
});

// Define type for transaction result
interface TransactionResult {
  index: number;
  transactionHash: string;
}

// Function to prepare and send a transaction
const prepareAndSendTransaction = async (
  contract: any,
  account: any,
  index: number
): Promise<TransactionResult> => {
  const transaction = claimTo({
    contract,
    to: account.address,
    tokenId: 0n,
    quantity: 1n,
  });

  const { transactionHash } = await sendTransaction({
    transaction,
    account,
  });

  console.log(`Transaction #${index} completed with hash: ${transactionHash}`);

  return {
    index,
    transactionHash,
  };
};

async function main() {
  console.log(
    "Starting batch transaction processing (traditional approach)..."
  );

  try {
    // Check if all required environment variables are set
    const requiredEnvVars = [
      "THIRDWEB_SECRET_KEY",
      "THIRDWEB_WALLET_PRIVATE_KEY",
      "THIRDWEB_DEPLOYED_CONTRACT_ADDRESS",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );
    if (missingVars.length > 0) {
      console.error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
      process.exit(1);
    }

    console.log("Setting up wallet account...");

    // Create an account from instance from private key
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

    // Number of transactions to send
    const numTransactions = 50;
    console.log(`Preparing to send ${numTransactions} transactions...`);

    // Create array of transaction promises
    const transactionPromises: Promise<TransactionResult>[] = [];

    // Create multiple transactions concurrently
    for (let i = 0; i < numTransactions; i++) {
      const promise = prepareAndSendTransaction(contract, account, i + 1);
      transactionPromises.push(promise);
    }

    // Wait for all transactions to complete
    console.log(`Sending ${numTransactions} transactions simultaneously...`);
    const startTime = Date.now();
    const results = await Promise.all(transactionPromises);
    const endTime = Date.now();

    console.log(`All ${numTransactions} transactions successfully completed!`);
    console.log(`Total time: ${(endTime - startTime) / 1000} seconds`);
    console.log(
      `Average time per transaction: ${
        (endTime - startTime) / numTransactions
      } ms`
    );

    // Display all transaction hashes
    console.log("\nTransaction Hashes:");
    results.forEach((result) => {
      console.log(`${result.index}: ${result.transactionHash}`);
      console.log(
        `View on explorer: https://sepolia.arbiscan.io/tx/${result.transactionHash}`
      );
    });
  } catch (e) {
    console.error("Error in batch transaction processing:", e);
    throw e;
  }
}

main().catch((err) => {
  console.error("Unhandled error in main function:", err);
  process.exit(1);
});
