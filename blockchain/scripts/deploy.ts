import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Starting deployment of OfflineTokenManager...");

  // Get the contract factory
  const OfflineTokenManager = await ethers.getContractFactory("OfflineTokenManager");

  // Deploy the contract
  console.log("Deploying OfflineTokenManager...");
  const offlineTokenManager = await OfflineTokenManager.deploy();

  // Wait for deployment to complete
  await offlineTokenManager.waitForDeployment();

  const contractAddress = await offlineTokenManager.getAddress();
  console.log("OfflineTokenManager deployed to:", contractAddress);

  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId);

  // Save deployment information
  const deploymentInfo = {
    contractAddress: contractAddress,
    network: network.name,
    chainId: network.chainId.toString(),
    deploymentTime: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save deployment info to file
  const deploymentFile = path.join(deploymentsDir, `${network.name}-deployment.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", deploymentFile);

  // Update .env file with contract address
  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    
    // Update or add the contract address
    const addressLine = `OFFLINE_TOKEN_CONTRACT_ADDRESS=${contractAddress}`;
    if (envContent.includes("OFFLINE_TOKEN_CONTRACT_ADDRESS=")) {
      envContent = envContent.replace(/OFFLINE_TOKEN_CONTRACT_ADDRESS=.*/, addressLine);
    } else {
      envContent += `\n${addressLine}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log("Updated .env file with contract address");
  }

  // Verify contract if on testnet
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await offlineTokenManager.deploymentTransaction()?.wait(5);
    
    console.log("Contract deployed and confirmed. You can verify it on Etherscan with:");
    console.log(`npx hardhat verify --network ${network.name} ${contractAddress}`);
  }

  console.log("Deployment completed successfully!");
}

// Handle errors
main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});