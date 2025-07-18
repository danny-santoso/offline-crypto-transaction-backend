import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const OfflineTokenManagerModule = buildModule("OfflineTokenManagerModule", (m) => {
  // Deploy the OfflineTokenManager contract
  const offlineTokenManager = m.contract("OfflineTokenManager", []);

  return { offlineTokenManager };
});

export default OfflineTokenManagerModule;