import { run } from "hardhat";
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

  console.log(`Verifying contract at ${contractAddress} on ${network}...`);

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [], // OfflineTokenManager has no constructor arguments
    });
    
    console.log("Contract verified successfully!");
  } catch (error: any) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("Contract is already verified!");
    } else {
      console.error("Verification failed:", error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});