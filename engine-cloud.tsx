import {
  createThirdwebClient,
  sendTransaction,
  getContract,
  Engine,
} from "thirdweb";
import { arbitrumSepolia } from "thirdweb/chains";
import { claimTo } from "thirdweb/extensions/erc1155";
import "dotenv/config";

// Create a thirdweb client
const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY || "",
});

// Create a server wallet
const serverWallet = Engine.serverWallet({
  client,
  address: process.env.THIRDWEB_SERVER_WALLET_ADDRESS || "",
  vaultAccessToken: process.env.THIRDWEB_VAULT_ACCESS_TOKEN || "",
});

// Function to prepare a transaction
const prepareTransaction = () => {
  return claimTo({
    contract: getContract({
      client,
      address: process.env.THIRDWEB_DEPLOYED_CONTRACT_ADDRESS || "", // Address of the ERC1155 token contract
      chain: arbitrumSepolia, // Chain of the ERC1155 token contract
    }),
    to: process.env.THIRDWEB_USER_WALLET_ADDRESS || "", // The address of the user to mint to
    tokenId: 0n, // The token ID of the NFT to mint
    quantity: 1n, // The quantity of NFTs to mint
  });
};

// Define type for transaction result
interface TransactionResult {
  index: number;
  transactionId: string;
}

async function main() {
  console.log("Starting batch transaction processing...");

  try {
    // Check if all required environment variables are set
    const requiredEnvVars = [
      "THIRDWEB_SECRET_KEY",
      "THIRDWEB_SERVER_WALLET_ADDRESS",
      "THIRDWEB_VAULT_ACCESS_TOKEN",
      "THIRDWEB_DEPLOYED_CONTRACT_ADDRESS",
      "THIRDWEB_USER_WALLET_ADDRESS",
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

    // Number of transactions to enqueue
    const numTransactions = 50;
    console.log(`Preparing to enqueue ${numTransactions} transactions...`);

    // Create array of transaction promises
    const transactionPromises: Promise<TransactionResult>[] = [];

    // Enqueue multiple transactions concurrently
    for (let i = 0; i < numTransactions; i++) {
      const transaction = prepareTransaction();
      const promise = serverWallet
        .enqueueTransaction({
          transaction,
        })
        .then((result) => {
          console.log(
            `Transaction #${i + 1} enqueued with ID: ${result.transactionId}`
          );
          return {
            index: i + 1,
            transactionId: result.transactionId,
          };
        });

      transactionPromises.push(promise);
    }

    // Wait for all transactions to be enqueued
    console.log(`Enqueuing ${numTransactions} transactions simultaneously...`);
    const startTime = Date.now();
    const results = await Promise.all(transactionPromises);
    const endTime = Date.now();

    console.log(`All ${numTransactions} transactions successfully enqueued!`);
    console.log(`Total time: ${(endTime - startTime) / 1000} seconds`);
    console.log(
      `Average time per transaction: ${
        (endTime - startTime) / numTransactions
      } ms`
    );

    // Display all transaction IDs
    console.log("\nTransaction IDs:");
    results.forEach((result) => {
      console.log(`${result.index}: ${result.transactionId}`);
    });

    console.log(
      "\nYou can check the status later using these transaction IDs."
    );
  } catch (error) {
    console.error("Error details:", error);
    throw error; // Re-throw so the outer catch can handle it
  }
}

// Execute the main function
main().catch((error) => {
  console.error("Error executing transactions:", error);
  console.error(
    "Make sure you have set all required environment variables in a .env file:"
  );
  console.error(
    "THIRDWEB_SECRET_KEY, THIRDWEB_SERVER_WALLET_ADDRESS, THIRDWEB_VAULT_ACCESS_TOKEN"
  );
  console.error(
    "THIRDWEB_DEPLOYED_CONTRACT_ADDRESS, THIRDWEB_USER_WALLET_ADDRESS"
  );
  process.exit(1);
});
