// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


import "./interfaces/IStaker.sol";
import "./interfaces/IFeeReceiver.sol";
import "./interfaces/IPoolRegistry.sol";
import "./interfaces/IProxyVault.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


/*
Main interface for the whitelisted proxy contract.

**This contract is meant to be able to be replaced for upgrade purposes. use IVoterProxy.operator() to always reference the current booster

*/
contract Booster{
    using SafeERC20 for IERC20;

    address public constant fxn = address(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09);

    address public immutable proxy;
    address public immutable fxnDepositor;
    address public immutable cvxfxn;
    address public immutable poolRegistry;
    address public immutable feeRegistry;
    address public owner;
    address public pendingOwner;

    address public poolManager;
    address public rewardManager;
    bool public isShutdown;
    address public feeQueue;
    address public feeToken;
    address public feeDistro;
    address public boostFeeQueue;

    // mapping(address=>mapping(address=>bool)) public feeClaimMap;


    constructor(address _proxy, address _depositor, address _cvxfxn, address _poolReg, address _feeReg) {
        proxy = _proxy;
        fxnDepositor = _depositor;
        cvxfxn = _cvxfxn;
        isShutdown = false;
        owner = msg.sender;
        rewardManager = msg.sender;
        poolManager = msg.sender;
        poolRegistry = _poolReg;
        feeRegistry = _feeReg;
     }

    /////// Owner Section /////////

    modifier onlyOwner() {
        require(owner == msg.sender, "!o_auth");
        _;
    }

    modifier onlyPoolManager() {
        require(poolManager == msg.sender, "!pool_auth");
        _;
    }

    //set pending owner
    function setPendingOwner(address _po) external onlyOwner{
        pendingOwner = _po;
        emit SetPendingOwner(_po);
    }

    //claim ownership
    function acceptPendingOwner() external {
        require(pendingOwner != address(0) && msg.sender == pendingOwner, "!p_owner");

        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerChanged(owner);
    }

    //set a reward manager
    function setRewardManager(address _rmanager) external onlyOwner{
        rewardManager = _rmanager;
        emit RewardManagerChanged(_rmanager);
    }

    //set pool manager
    function setPoolManager(address _pmanager) external onlyOwner{
        poolManager = _pmanager;
        emit PoolManagerChanged(_pmanager);
    }

    //make execute() calls to the proxy voter
    function _proxyCall(address _to, bytes memory _data) internal{
        (bool success,) = IStaker(proxy).execute(_to,uint256(0),_data);
        require(success, "Proxy Call Fail");
    }

    //set fee queue for vefxn
    function setFeeQueue(address _queue) external onlyOwner{
        feeQueue = _queue;
        emit FeeQueueChanged(_queue);
    }

    function setFeeToken(address _feeToken, address _distro) external onlyOwner{
        feeToken = _feeToken;
        feeDistro = _distro;
        emit FeeTokenSet(_feeToken, _distro);
    }

    //claim operator roles for certain systems for direct access
    function claimOperatorRoles() external onlyOwner{
        require(!isShutdown,"shutdown");

        //claim operator role of pool registry
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setOperator(address)")), address(this));
        _proxyCall(poolRegistry,data);
    }
    
    //shutdown this contract.
    function shutdownSystem() external onlyOwner{
        //This version of booster does not require any special steps before shutting down
        //and can just immediately be set.
        isShutdown = true;
        emit Shutdown();
    }

    //vote for gauge weights
    function voteGaugeWeight(address _controller, address[] calldata _gauge, uint256[] calldata _weight) external onlyOwner{
        for(uint256 i = 0; i < _gauge.length; ){
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256("vote_for_gauge_weights(address,uint256)")), _gauge[i], _weight[i]);
            _proxyCall(_controller,data);
            unchecked{ ++i; }
        }
    }

    function setTokenMinter(address _operator, bool _valid) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setOperator(address,bool)")), _operator, _valid);
        _proxyCall(cvxfxn,data);
    }

    //set voting delegate
    function setDelegate(address _delegateContract, address _delegate, bytes32 _space) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setDelegate(bytes32,address)")), _space, _delegate);
        _proxyCall(_delegateContract,data);
        emit DelegateSet(_delegate);
    }

    //recover tokens on this contract
    function recoverERC20(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        IERC20(_tokenAddress).safeTransfer(_withdrawTo, _tokenAmount);
        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //recover tokens on the proxy
    function recoverERC20FromProxy(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), _withdrawTo, _tokenAmount);
        _proxyCall(_tokenAddress,data);

        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //set fees on user vaults
    function setPoolFees(uint256 _cvxfxs, uint256 _cvx, uint256 _platform) external onlyOwner{
        require(!isShutdown,"shutdown");

        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setFees(uint256,uint256,uint256)")), _cvxfxs, _cvx, _platform);
        _proxyCall(feeRegistry,data);
    }

    //set fee deposit address for all user vaults
    function setPoolFeeDeposit(address _deposit) external onlyOwner{
        require(!isShutdown,"shutdown");

        //change on fee registry
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setDepositAddress(address)")), _deposit);
        _proxyCall(feeRegistry,data);

        //also change here
        boostFeeQueue = _deposit;
        emit BoostFeeQueueChanged(_deposit);
    }

    //add pool on registry
    function addPool(address _implementation, address _stakingAddress, address _stakingToken) external onlyPoolManager{
        IPoolRegistry(poolRegistry).addPool(_implementation, _stakingAddress, _stakingToken);
    }

    //set a new reward pool implementation for future pools
    function setPoolRewardImplementation(address _impl) external onlyPoolManager{
        IPoolRegistry(poolRegistry).setRewardImplementation(_impl);
    }

    //deactivate a pool
    function deactivatePool(uint256 _pid) external onlyPoolManager{
        IPoolRegistry(poolRegistry).deactivatePool(_pid);
    }

    //set extra reward contracts to be active when pools are created
    function setRewardActiveOnCreation(bool _active) external onlyPoolManager{
        IPoolRegistry(poolRegistry).setRewardActiveOnCreation(_active);
    }

    //////// End Owner Section ///////////

    function createVault(uint256 _pid) external returns (address){
        //create minimal proxy vault for specified pool
        // (address vault, address stakeAddress, address stakeToken, address rewards) = IPoolRegistry(poolRegistry).addUserVault(_pid, msg.sender);
        (address vault, address stakeAddress, ,) = IPoolRegistry(poolRegistry).addUserVault(_pid, msg.sender);

        //make voterProxy call proxyToggleStaker(vault) on the pool's stakingAddress to set it as a proxied child
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("toggleVoteSharing(address)")), vault);
        _proxyCall(stakeAddress,data);

        //call proxy initialize
        IProxyVault(vault).initialize(msg.sender, _pid);

        //set vault vefxs proxy
        data = abi.encodeWithSelector(bytes4(keccak256("setVeFXNProxy(address)")), proxy);
        _proxyCall(vault,data);

        return vault;
    }

    //claim fees for vefxn
    function claimFees() external {
        require(feeQueue != address(0),"!queue");

        IStaker(proxy).claimFees(feeDistro, feeToken, feeQueue);
        IFeeReceiver(feeQueue).processFees();
    }

    //claim fees for boosting
    function claimBoostFees() external {
        require(boostFeeQueue != address(0),"!queue");

        IFeeReceiver(boostFeeQueue).processFees();
    }


    
    /* ========== EVENTS ========== */
    event SetPendingOwner(address indexed _address);
    event OwnerChanged(address indexed _address);
    event FeeQueueChanged(address indexed _address);
    event BoostFeeQueueChanged(address indexed _address);
    event FeeTokenSet(address indexed _address, address _distro);
    event RewardManagerChanged(address indexed _address);
    event PoolManagerChanged(address indexed _address);
    event Shutdown();
    event DelegateSet(address indexed _address);
    event Recovered(address indexed _token, uint256 _amount);
}