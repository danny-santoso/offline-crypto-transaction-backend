// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title OfflineTokenManager
 * @dev Smart contract for managing offline cryptocurrency transactions
 * Allows users to purchase offline tokens (OTs) and redeem them later
 */
contract OfflineTokenManager {
    // Events
    event TokensPurchased(address indexed user, uint256 amount, uint256 timestamp);
    event TokensRedeemed(address indexed user, uint256 amount, uint256 timestamp);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event OTMAuthorized(address indexed otmAddress, uint256 timestamp);
    event OTMRevoked(address indexed otmAddress, uint256 timestamp);
    event PublicKeyDatabaseUpdated(uint256 totalKeys, uint256 timestamp);
    event TokenSignatureValidated(bytes32 indexed signatureHash, address indexed otm, uint256 amount);
    
    // Transaction history and monitoring events
    event TransactionRecorded(
        bytes32 indexed transactionId,
        address indexed user,
        string transactionType,
        uint256 amount,
        uint256 timestamp,
        uint256 nonce
    );
    event BalanceUpdated(address indexed user, uint256 newBalance, uint256 timestamp);
    event NonceIncremented(address indexed user, uint256 newNonce, uint256 timestamp);
    
    // State variables
    mapping(address => uint256) private balances;
    mapping(address => uint256) private offlineTokenCredits;
    uint256 public totalSupply;
    uint256 public totalOfflineCredits;
    
    // Contract owner
    address public owner;
    
    // Public key management for OTM signature validation
    mapping(address => bool) public authorizedOTMs;
    address[] public otmPublicKeys;
    mapping(address => uint256) public otmKeyIndex;
    
    // Nonce tracking for replay attack prevention
    mapping(bytes32 => bool) public usedSignatures;
    
    // Transaction history and nonce management
    struct TransactionRecord {
        bytes32 transactionId;
        address user;
        string transactionType;
        uint256 amount;
        uint256 timestamp;
        uint256 nonce;
        bytes32 blockHash;
    }
    
    // User nonce tracking for sequential transaction ordering
    mapping(address => uint256) public userNonces;
    
    // Transaction history storage
    mapping(address => TransactionRecord[]) private userTransactionHistory;
    mapping(bytes32 => TransactionRecord) public transactionRecords;
    
    // Global transaction counter for unique IDs
    uint256 private transactionCounter;
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier validAddress(address _address) {
        require(_address != address(0), "Invalid address");
        _;
    }
    
    modifier onlyAuthorizedOTM() {
        require(authorizedOTMs[msg.sender], "Only authorized OTM can call this function");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        totalSupply = 0;
        totalOfflineCredits = 0;
        transactionCounter = 0;
    }
    
    /**
     * @dev Record a transaction in the user's history
     * @param user Address of the user
     * @param transactionType Type of transaction (purchase, redeem, transfer, etc.)
     * @param amount Amount involved in the transaction
     * @return bytes32 Transaction ID
     */
    function _recordTransaction(
        address user,
        string memory transactionType,
        uint256 amount
    ) internal returns (bytes32) {
        // Increment user nonce for sequential ordering
        userNonces[user]++;
        
        // Generate unique transaction ID
        transactionCounter++;
        bytes32 transactionId = keccak256(
            abi.encodePacked(
                user,
                transactionType,
                amount,
                block.timestamp,
                userNonces[user],
                transactionCounter
            )
        );
        
        // Create transaction record
        TransactionRecord memory record = TransactionRecord({
            transactionId: transactionId,
            user: user,
            transactionType: transactionType,
            amount: amount,
            timestamp: block.timestamp,
            nonce: userNonces[user],
            blockHash: blockhash(block.number - 1)
        });
        
        // Store transaction record
        userTransactionHistory[user].push(record);
        transactionRecords[transactionId] = record;
        
        // Emit events for monitoring and indexing
        emit TransactionRecorded(
            transactionId,
            user,
            transactionType,
            amount,
            block.timestamp,
            userNonces[user]
        );
        
        emit NonceIncremented(user, userNonces[user], block.timestamp);
        
        return transactionId;
    }
    
    /**
     * @dev Update user balance and emit balance update event
     * @param user Address of the user
     * @param newBalance New balance amount
     */
    function _updateBalance(address user, uint256 newBalance) internal {
        balances[user] = newBalance;
        emit BalanceUpdated(user, newBalance, block.timestamp);
    }
    
    /**
     * @dev Get user's transaction history
     * @param user Address of the user
     * @return Array of transaction records
     */
    function getUserTransactionHistory(address user) 
        external 
        view 
        validAddress(user) 
        returns (TransactionRecord[] memory) 
    {
        return userTransactionHistory[user];
    }
    
    /**
     * @dev Get user's transaction count
     * @param user Address of the user
     * @return Number of transactions
     */
    function getUserTransactionCount(address user) 
        external 
        view 
        validAddress(user) 
        returns (uint256) 
    {
        return userTransactionHistory[user].length;
    }
    
    /**
     * @dev Get specific transaction by ID
     * @param transactionId ID of the transaction
     * @return Transaction record
     */
    function getTransaction(bytes32 transactionId) 
        external 
        view 
        returns (TransactionRecord memory) 
    {
        require(transactionRecords[transactionId].transactionId != bytes32(0), "Transaction not found");
        return transactionRecords[transactionId];
    }
    
    /**
     * @dev Get user's current nonce
     * @param user Address of the user
     * @return Current nonce value
     */
    function getUserNonce(address user) external view validAddress(user) returns (uint256) {
        return userNonces[user];
    }
    
    /**
     * @dev Validate transaction nonce for sequential ordering
     * @param user Address of the user
     * @param expectedNonce Expected nonce value
     * @return bool True if nonce is valid
     */
    function validateTransactionNonce(address user, uint256 expectedNonce) 
        external 
        view 
        validAddress(user) 
        returns (bool) 
    {
        return userNonces[user] + 1 == expectedNonce;
    }
    
    /**
     * @dev Get paginated transaction history for a user
     * @param user Address of the user
     * @param offset Starting index
     * @param limit Maximum number of records to return
     * @return Array of transaction records
     */
    function getUserTransactionHistoryPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view validAddress(user) returns (TransactionRecord[] memory) {
        require(limit > 0 && limit <= 100, "Invalid limit");
        
        TransactionRecord[] memory userHistory = userTransactionHistory[user];
        require(offset < userHistory.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > userHistory.length) {
            end = userHistory.length;
        }
        
        TransactionRecord[] memory result = new TransactionRecord[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = userHistory[i];
        }
        
        return result;
    }
    
    /**
     * @dev Validate offline token signature
     * @param signature The cryptographic signature to validate
     * @param amount Token amount that was signed
     * @param tokenId Unique identifier for the token
     * @param issuer Address of the OTM that issued the token
     * @param nonce Unique nonce to prevent replay attacks
     * @return bool True if signature is valid
     */
    function validateTokenSignature(
        bytes memory signature,
        uint256 amount,
        bytes32 tokenId,
        address issuer,
        uint256 nonce
    ) external returns (bool) {
        require(authorizedOTMs[issuer], "Issuer is not an authorized OTM");
        require(signature.length == 65, "Invalid signature length");
        
        // Create signature hash to prevent replay attacks
        bytes32 signatureHash = keccak256(abi.encodePacked(signature, tokenId, nonce));
        require(!usedSignatures[signatureHash], "Signature already used");
        
        // Create message hash from token data
        bytes32 messageHash = keccak256(abi.encodePacked(amount, tokenId, issuer, nonce));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        // Recover signer address from signature
        address recoveredSigner = recoverSigner(ethSignedMessageHash, signature);
        
        // Validate that the recovered signer is the claimed issuer
        bool isValid = (recoveredSigner == issuer);
        
        if (isValid) {
            // Mark signature as used to prevent replay attacks
            usedSignatures[signatureHash] = true;
            emit TokenSignatureValidated(signatureHash, issuer, amount);
        }
        
        return isValid;
    }
    
    /**
     * @dev Update the public key database with new authorized OTM addresses
     * @param newKeys Array of new OTM public key addresses to authorize
     */
    function updatePublicKeyDatabase(address[] memory newKeys) external onlyOwner {
        require(newKeys.length > 0, "Must provide at least one key");
        
        // Clear existing keys
        for (uint256 i = 0; i < otmPublicKeys.length; i++) {
            authorizedOTMs[otmPublicKeys[i]] = false;
            delete otmKeyIndex[otmPublicKeys[i]];
        }
        delete otmPublicKeys;
        
        // Add new keys
        for (uint256 i = 0; i < newKeys.length; i++) {
            require(newKeys[i] != address(0), "Invalid OTM address");
            require(!authorizedOTMs[newKeys[i]], "Duplicate OTM address");
            
            authorizedOTMs[newKeys[i]] = true;
            otmPublicKeys.push(newKeys[i]);
            otmKeyIndex[newKeys[i]] = i;
            
            emit OTMAuthorized(newKeys[i], block.timestamp);
        }
        
        emit PublicKeyDatabaseUpdated(newKeys.length, block.timestamp);
    }
    
    /**
     * @dev Add a single authorized OTM address
     * @param otmAddress Address of the OTM to authorize
     */
    function addAuthorizedOTM(address otmAddress) external onlyOwner validAddress(otmAddress) {
        require(!authorizedOTMs[otmAddress], "OTM already authorized");
        
        authorizedOTMs[otmAddress] = true;
        otmPublicKeys.push(otmAddress);
        otmKeyIndex[otmAddress] = otmPublicKeys.length - 1;
        
        emit OTMAuthorized(otmAddress, block.timestamp);
    }
    
    /**
     * @dev Remove an authorized OTM address
     * @param otmAddress Address of the OTM to revoke
     */
    function revokeAuthorizedOTM(address otmAddress) external onlyOwner validAddress(otmAddress) {
        require(authorizedOTMs[otmAddress], "OTM not authorized");
        
        authorizedOTMs[otmAddress] = false;
        
        // Remove from array by swapping with last element
        uint256 index = otmKeyIndex[otmAddress];
        uint256 lastIndex = otmPublicKeys.length - 1;
        
        if (index != lastIndex) {
            address lastOTM = otmPublicKeys[lastIndex];
            otmPublicKeys[index] = lastOTM;
            otmKeyIndex[lastOTM] = index;
        }
        
        otmPublicKeys.pop();
        delete otmKeyIndex[otmAddress];
        
        emit OTMRevoked(otmAddress, block.timestamp);
    }
    
    /**
     * @dev Get all authorized OTM addresses
     * @return Array of authorized OTM addresses
     */
    function getAuthorizedOTMs() external view returns (address[] memory) {
        return otmPublicKeys;
    }
    
    /**
     * @dev Check if an address is an authorized OTM
     * @param otmAddress Address to check
     * @return bool True if address is authorized
     */
    function isAuthorizedOTM(address otmAddress) external view returns (bool) {
        return authorizedOTMs[otmAddress];
    }
    
    /**
     * @dev Get the total number of authorized OTMs
     * @return uint256 Number of authorized OTMs
     */
    function getAuthorizedOTMCount() external view returns (uint256) {
        return otmPublicKeys.length;
    }
    
    /**
     * @dev Check if a signature has been used (replay attack prevention)
     * @param signatureHash Hash of the signature to check
     * @return bool True if signature has been used
     */
    function isSignatureUsed(bytes32 signatureHash) external view returns (bool) {
        return usedSignatures[signatureHash];
    }
    
    /**
     * @dev Internal function to recover signer address from signature
     * @param hash The hash that was signed
     * @param signature The signature bytes
     * @return address The recovered signer address
     */
    function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        // Adjust v if necessary
        if (v < 27) {
            v += 27;
        }
        
        require(v == 27 || v == 28, "Invalid signature v value");
        
        return ecrecover(hash, v, r, s);
    }
    
    /**
     * @dev Purchase offline tokens by depositing cryptocurrency
     * @param amount Amount of tokens to purchase
     */
    function purchaseOfflineTokens(uint256 amount) external payable {
        require(amount > 0, "Amount must be greater than 0");
        require(msg.value >= amount, "Insufficient payment");
        
        // Update user's offline token credits
        offlineTokenCredits[msg.sender] += amount;
        totalOfflineCredits += amount;
        
        // Update total supply
        totalSupply += amount;
        
        // Record transaction in history
        _recordTransaction(msg.sender, "purchase", amount);
        
        // Emit balance update event for monitoring (using offline credits as balance)
        emit BalanceUpdated(msg.sender, offlineTokenCredits[msg.sender], block.timestamp);
        
        // Refund excess payment
        if (msg.value > amount) {
            payable(msg.sender).transfer(msg.value - amount);
        }
        
        emit TokensPurchased(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @dev Redeem offline tokens for cryptocurrency
     * @param amount Amount of tokens to redeem
     */
    function redeemOfflineTokens(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(offlineTokenCredits[msg.sender] >= amount, "Insufficient offline token credits");
        require(address(this).balance >= amount, "Insufficient contract balance");
        
        // Update user's offline token credits
        offlineTokenCredits[msg.sender] -= amount;
        totalOfflineCredits -= amount;
        
        // Update total supply
        totalSupply -= amount;
        
        // Record transaction in history
        _recordTransaction(msg.sender, "redeem", amount);
        
        // Emit balance update event for monitoring (using offline credits as balance)
        emit BalanceUpdated(msg.sender, offlineTokenCredits[msg.sender], block.timestamp);
        
        // Transfer cryptocurrency to user
        payable(msg.sender).transfer(amount);
        
        emit TokensRedeemed(msg.sender, amount, block.timestamp);
    }
    
    /**
     * @dev Get user's cryptocurrency balance
     * @param user Address of the user
     * @return User's balance
     */
    function getBalance(address user) external view validAddress(user) returns (uint256) {
        return balances[user];
    }
    
    /**
     * @dev Get user's offline token credits
     * @param user Address of the user
     * @return User's offline token credits
     */
    function getOfflineTokenCredits(address user) external view validAddress(user) returns (uint256) {
        return offlineTokenCredits[user];
    }
    
    /**
     * @dev Internal transfer function for moving tokens between users
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function _transfer(address from, address to, uint256 amount) internal validAddress(from) validAddress(to) {
        require(balances[from] >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be greater than 0");
        
        // Update balances
        _updateBalance(from, balances[from] - amount);
        _updateBalance(to, balances[to] + amount);
        
        // Record transactions for both sender and receiver
        _recordTransaction(from, "transfer_out", amount);
        _recordTransaction(to, "transfer_in", amount);
        
        emit Transfer(from, to, amount);
    }
    
    /**
     * @dev Transfer tokens to another user (for internal contract use)
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function transferToClient(address to, uint256 amount) external validAddress(to) {
        _transfer(msg.sender, to, amount);
    }
    
    /**
     * @dev Transfer tokens to OTM (for internal contract use)
     * @param amount Amount to transfer
     */
    function transferToOTM(uint256 amount) external {
        _transfer(msg.sender, owner, amount);
    }
    
    /**
     * @dev Get contract's total supply
     * @return Total supply of tokens
     */
    function getTotalSupply() external view returns (uint256) {
        return totalSupply;
    }
    
    /**
     * @dev Get total offline credits issued
     * @return Total offline credits
     */
    function getTotalOfflineCredits() external view returns (uint256) {
        return totalOfflineCredits;
    }
    
    /**
     * @dev Get contract balance
     * @return Contract's ETH balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Emergency withdrawal function (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    /**
     * @dev Receive function to accept ETH deposits
     */
    receive() external payable {
        // Allow contract to receive ETH
    }
    
    /**
     * @dev Fallback function
     */
    fallback() external payable {
        // Allow contract to receive ETH
    }
}