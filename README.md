# Batch Transactions Demo

A demonstration project that compares two approaches for sending batch blockchain transactions using thirdweb:

1. **Traditional Approach**: Direct transaction submission using thirdweb's client
2. **Engine Approach**: Transaction queueing with thirdweb's Engine

## Overview

This project provides a server with endpoints to test and benchmark batch transaction performance. It allows sending multiple ERC1155 token claims in a single batch to measure execution time, gas costs, and transaction confirmation speeds across both methods.

## Technology Stack

- Node.js with Express
- thirdweb SDK for blockchain interactions
- Arbitrum Sepolia test network
- TypeScript

## API Endpoints

- `/traditional` - Process batch transactions using the traditional approach
- `/engine` - Process batch transactions using the Engine approach
- `/health` - Health check endpoint

## Purpose

This demo helps developers understand the performance characteristics and trade-offs between direct transaction submission and using thirdweb's Engine for transaction management, particularly when dealing with high-volume transaction batches.

Each approach provides detailed metrics including:
- Total execution time
- Time to receive transaction hashes/IDs
- Average time per transaction
- Gas cost estimates (Traditional approach)
- Confirmation times (Traditional approach) 