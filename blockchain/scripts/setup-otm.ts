import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  
  // Read deployment info
  const deploymentFile = path.join(__dirname, "../deployments", `${network}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.error("Please deploy the contract first using: npm run deploy");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contractAddress = deploymentInfo.contractAddress;

  console.log(`Setting up OTM authorization for contract at ${contractAddress}...`);

  // Get contract instance
  const OfflineTokenManager = await ethers.getContractFactory("OfflineTokenManager");
  const contract = OfflineTokenManager.attach(contractAddress);

  // Get signers
  const [owner, otm1, otm2] = await ethers.getSigners();
  
  console.log("Owner address:", owner.address);
  console.log("OTM1 address:", otm1.address);
  console.log("OTM2 address:", otm2.address);

  try {
    // Add initial OTM addresses
    const otmAddresses = [otm1.address, otm2.address];
    
    console.log("Adding authorized OTMs...");
    const tx = await contract.updatePublicKeyDatabase(otmAddresses);
    await tx.wait();
    
    console.log("OTM setup completed successfully!");
    
    // Verify the setup
    const authorizedOTMs = await contract.getAuthorizedOTMs();
    console.log("Authorized OTMs:", authorizedOTMs);
    
    // Save OTM info
    const otmInfo = {
      authorizedOTMs: authorizedOTMs,
      setupTime: new Date().toISOString(),
      network: network,
      contractAddress: contractAddress,
    };
    
    const otmFile = path.join(__dirname, "../deployments", `${network}-otm-setup.json`);
    fs.writeFileSync(otmFile, JSON.stringify(otmInfo, null, 2));
    console.log("OTM setup info saved to:", otmFile);
    
  } catch (error) {
    console.error("OTM setup failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});