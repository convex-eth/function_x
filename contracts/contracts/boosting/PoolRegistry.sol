// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IProxyFactory.sol";
import "../interfaces/IRewards.sol";

/*
Pool Registry

Holds list of all pool information and user vault information.
Clones new vaults for users
Clones reward contracts for pools

*/
contract PoolRegistry {

    //owner is the voteproxy contract holding vefxn
    address public constant owner = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);
    //minimal proxy factory
    address public constant proxyFactory = address(0x66807B5598A848602734B82E432dD88DBE13fC8f);

    address public operator;
    address public rewardImplementation;
    bool public rewardsStartActive;
    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => address)) public vaultMap; //pool -> user -> vault
    mapping(uint256 => address[]) public poolVaultList; //pool -> vault array
    
    struct PoolInfo {
        address implementation; //vault implementation
        address stakingAddress; //staking address, aka gauge
        address stakingToken; //the staking token, ex. a curve lp token
        address rewardsAddress; //address for extra rewards contract for convex rewards
        uint8 active; //pool is active or not
    }

    event PoolCreated(uint256 indexed poolid, address indexed implementation, address stakingAddress, address stakingToken);
    event PoolDeactivated(uint256 indexed poolid);
    event AddUserVault(address indexed user, uint256 indexed poolid);
    event OperatorChanged(address indexed account);
    event RewardImplementationChanged(address indexed implementation);
    event RewardActiveOnCreationChanged(bool value);

    constructor() {}

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    modifier onlyOperator() {
        require(operator == msg.sender, "!op auth");
        _;
    }

    //set operator/manager
    function setOperator(address _op) external onlyOwner{
        operator = _op;
        emit OperatorChanged(_op);
    }

    //set extra reward implementation contract for future pools
    function setRewardImplementation(address _imp) external onlyOperator{
        rewardImplementation = _imp;
        emit RewardImplementationChanged(_imp);
    }

    //set rewards to be active when pool is created
    function setRewardActiveOnCreation(bool _active) external onlyOperator{
        rewardsStartActive = _active;
        emit RewardActiveOnCreationChanged(_active);
    }

    //get number of pools
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    //get number of vaults made for a specific pool
    function poolVaultLength(uint256 _pid) external view returns (uint256) {
        return poolVaultList[_pid].length;
    }

    //add a new pool and implementation
    function addPool(address _implementation, address _stakingAddress, address _stakingToken) external onlyOperator{
        require(_implementation != address(0), "!imp");
        require(_stakingAddress != address(0), "!stkAdd");
        require(_stakingToken != address(0), "!stkTok");
        require(rewardImplementation != address(0), "!rewardImplementation");

        //create and initialize rewards if available
        address rewards = IProxyFactory(proxyFactory).clone(rewardImplementation);
        IRewards(rewards).initialize(poolInfo.length, rewardsStartActive);

        //add to pool list
        poolInfo.push(
            PoolInfo({
                implementation: _implementation,
                stakingAddress: _stakingAddress,
                stakingToken: _stakingToken,
                rewardsAddress: rewards,
                active: 1
            })
        );
        emit PoolCreated(poolInfo.length-1, _implementation, _stakingAddress, _stakingToken);
    }

    //deactivates pool so that new vaults can not be made.
    //can not force shutdown/withdraw user funds
    function deactivatePool(uint256 _pid) external onlyOperator{
        poolInfo[_pid].active = 0;
        emit PoolDeactivated(_pid);
    }

    //clone a new user vault
    function addUserVault(uint256 _pid, address _user) external onlyOperator returns(address vault, address stakingAddress, address stakingToken, address rewards){
        require(vaultMap[_pid][_user] == address(0), "already exists");

        PoolInfo storage pool = poolInfo[_pid];
        require(pool.active > 0, "!active");

        //create
        vault = IProxyFactory(proxyFactory).clone(pool.implementation);
        //add to user map
        vaultMap[_pid][_user] = vault;
        //add to pool vault list
        poolVaultList[_pid].push(vault);

        //return values
        stakingAddress = pool.stakingAddress;
        stakingToken = pool.stakingToken;
        rewards = pool.rewardsAddress;

        emit AddUserVault(_user, _pid);
    }

}
