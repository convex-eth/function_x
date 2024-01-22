const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const FxnVoterProxy = artifacts.require("FxnVoterProxy");
const Booster = artifacts.require("Booster");
const FeeReceiverCvxFxn = artifacts.require("FeeReceiverCvxFxn");
const FeeDepositV2 = artifacts.require("FeeDepositV2");
const cvxFxnStaking = artifacts.require("cvxFxnStaking");
const FxnDepositor = artifacts.require("FxnDepositor");
const cvxFxnToken = artifacts.require("cvxFxnToken");

const FeeRegistry = artifacts.require("FeeRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const MockGauge = artifacts.require("MockGauge");
const MultiRewards = artifacts.require("MultiRewards");
const StakingProxyBase = artifacts.require("StakingProxyBase");
const StakingProxyERC20 = artifacts.require("StakingProxyERC20");
const StakingProxyRebalancePool = artifacts.require("StakingProxyRebalancePool");
const PoolUtilities = artifacts.require("PoolUtilities");


const IFxnGauge = artifacts.require("IFxnGauge");
const IERC20 = artifacts.require("IERC20");
const IGaugeController = artifacts.require("IGaugeController");



const addAccount = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_addAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const unlockAccount = async (address) => {
  await addAccount(address);
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "personal_unlockAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const unlockAccountHardhat = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "hardhat_impersonateAccount",
        params: [address],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const setNoGas = async () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "hardhat_setNextBlockBaseFeePerGas",
        params: ["0x0"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const send = payload => {
  if (!payload.jsonrpc) payload.jsonrpc = '2.0';
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });

/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await web3.eth.getBlock('latest');
  return timestamp;
};

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
  // It's handy to be able to be able to pass big numbers in as we can just
  // query them from the contract, then send them back. If not changed to
  // a number, this causes much larger fast forwards than expected without error.
  if (BN.isBN(seconds)) seconds = seconds.toNumber();

  // And same with strings.
  if (typeof seconds === 'string') seconds = parseFloat(seconds);

  await send({
    method: 'evm_increaseTime',
    params: [seconds],
  });

  await mineBlock();
};

contract("staking platform", async accounts => {
  it("should successfully run", async () => {
    
    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    let cvx = await IERC20.at(contractList.system.cvx);
    let fxn = await IERC20.at(contractList.fxn.fxn);
    let vefxn = await IERC20.at(contractList.fxn.vefxn);
    

    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    let rebalance = await IFxnGauge.at("0xc6dEe5913e010895F3702bc43a40d661B13a40BD");
    console.log("gauge address: " +rebalance.address);

    // await unlockAccount(contractList.system.voteProxy);
    // // await unlockAccountHardhat(contractList.system.voteProxy);
    // // await setNoGas();
    // await rebalance.toggleVoteSharing(deployer,{from:contractList.system.voteProxy,gasPrice:0});
    // console.log("test set deployer as toggleVoteSharing");

    // return;

    const advanceTime = async (secondsElaspse) => {
      await time.increase(secondsElaspse);
      await time.advanceBlock();
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;
    await unlockAccountHardhat(deployer);
    // await unlockAccount(deployer);
    await unlockAccountHardhat(multisig);
    // await unlockAccount(multisig);
    console.log("deploying from " +deployer);
    
    let actingUser = userA
    await unlockAccountHardhat(actingUser);
    // await unlockAccount(actingUser);

    //deploy
    // let voteproxy = await FxnVoterProxy.new({from:deployer});
    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.at(contractList.system.cvxFxn);
    let fxndeposit = await FxnDepositor.at(contractList.system.fxnDepositor);
    let oldbooster = await Booster.at(await voteproxy.operator());
    let staking = await cvxFxnStaking.at(contractList.system.cvxFxnStaking);
    let stakingFeeReceiver = await FeeReceiverCvxFxn.at(contractList.system.cvxFxnStakingFeeReceiver);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefxnRewardQueue);

    await setNoGas();
    let feeReg = await FeeRegistry.new({from:deployer});
    let poolReg = await PoolRegistry.new({from:deployer});
    let poolRewards = await MultiRewards.new(poolReg.address, {from:deployer});
    let vault_erc = await StakingProxyERC20.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, {from:deployer});
    let vault_rebalance = await StakingProxyRebalancePool.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, {from:deployer});
    let booster = await Booster.new(voteproxy.address, fxndeposit.address, cvxfxn.address, poolReg.address, feeReg.address, {from:deployer} );
    let poolFeeQueue = await FeeDepositV2.new(contractList.system.voteProxy, contractList.system.cvxFxn, contractList.system.cvxFxnStakingFeeReceiver, {from:deployer});
    let poolUtil = await PoolUtilities.new(poolReg.address, {from:deployer});
    contractList.system.booster = booster.address;
    contractList.system.feeReg = feeReg.address;
    contractList.system.poolReg = poolReg.address;
    contractList.system.poolRewards = poolRewards.address;
    contractList.system.vault_erc = vault_erc.address;
    contractList.system.vault_rebalance = vault_rebalance.address;
    contractList.system.poolUtility = poolUtil.address;
    // jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });
    console.log(contractList.system);

    console.log("deployed");

    console.log("old booster at: " +oldbooster.address);
    await oldbooster.isShutdown().then(a=>console.log("old is shutdown? " +a));
    await oldbooster.shutdownSystem({from:multisig,gasPrice:0});
    await oldbooster.isShutdown().then(a=>console.log("old is shutdown? " +a));
    await voteproxy.operator().then(a=>console.log("current operator: " +a));
    await voteproxy.setOperator(booster.address,{from:multisig,gasPrice:0})
    await voteproxy.operator().then(a=>console.log("current operator: " +a));
   
    await setNoGas();
    await booster.setFeeToken(contractList.fxn.feeToken, contractList.fxn.vefxnRewardDistro, {from:deployer,gasPrice:0});
    await booster.setFeeQueue(feeQueue.address,{from:deployer,gasPrice:0});
    await setNoGas();
    await booster.claimOperatorRoles({from:deployer,gasPrice:0});
    await booster.setPoolRewardImplementation(poolRewards.address,{from:deployer,gasPrice:0});
    await booster.setPoolFeeDeposit(poolFeeQueue.address,{from:deployer,gasPrice:0});

    await setNoGas();
    await booster.setPendingOwner(multisig,{from:deployer});
    await setNoGas();
    await booster.acceptPendingOwner({from:multisig,gasPrice:0});
    console.log("set new booster as operator");


    console.log("\n\ncreate new pool...");
    let gauge = await IFxnGauge.at("0xc6dEe5913e010895F3702bc43a40d661B13a40BD");
    let gaugeB = "0xB87A8332dFb1C76Bb22477dCfEdDeB69865cA9f9";
    let staketoken = await IERC20.at("0x53805A76E1f5ebbFE7115F16f9c87C2f7e633726");
    // let gauge = await MockGauge.new(lptoken.address,{from:deployer});

    console.log("stake token: " +staketoken.address);
    console.log("gauge address: " +gauge.address);

    // await unlockAccount(voteproxy.address);
    // await setNoGas();
    // await gauge.toggleVoteSharing(deployer,{from:voteproxy.address,gasPrice:0});
    // console.log("test set deployer as toggleVoteSharing");

    // var controller = await IGaugeController.at(contractList.fxn.gaugeController);
    // var controllerAdmin = await controller.admin();
    // await unlockAccount(controllerAdmin);
    // await controller.add_type("testtype",web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    // await controller.add_gauge(gauge.address,0,web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    // console.log("gauge added to controller");
    // await controller.gauge_relative_weight(gauge.address).then(a=>console.log("gauge rel weight: " +a))

    await setNoGas();
    var tx = await booster.addPool(vault_rebalance.address, gauge.address, staketoken.address,{from:deployer,gasPrice:0});
    console.log("pool added, gas: " +tx.receipt.gasUsed);
    var poolid = Number(await poolReg.poolLength()) - 1;
    console.log("new pool count: " +(poolid+1));

    var poolinfo = await poolReg.poolInfo(poolid);
    console.log(poolinfo);


    console.log("transfer stake tokens to actingUser...");
    let holder = "0xc6dEe5913e010895F3702bc43a40d661B13a40BD";
    let depositAmount = "10.0"
    await unlockAccountHardhat(holder);
    await setNoGas();
    await staketoken.transfer(actingUser, web3.utils.toWei(depositAmount, "ether"),{from:holder,gasPrice:0});
    var tokenBalance = await staketoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);


    console.log("\n\nstake to new pool...");

    //create vault
    var tx = await booster.createVault(poolid,{from:actingUser});
    console.log("created vault: gas = " +tx.receipt.gasUsed);
    
    //get vault
    let vaultAddress = await poolReg.vaultMap(poolid,actingUser);
    let vault = await StakingProxyRebalancePool.at(vaultAddress)
    console.log("vault at " +vault.address);// +", gas: " +tx.receipt.gasUsed);

    await vault.gaugeAddress().then(a=>console.log("vault.gaugeAddress() " +a))
    await vault.stakingToken().then(a=>console.log("vault.stakingToken() " +a))
    await vault.rewards().then(a=>console.log("vault.rewards() " +a))
    
    var poolrewards = await MultiRewards.at(await vault.rewards());
    console.log("extra rewards at: " +poolrewards.address)
    await poolrewards.rewardState().then(a=>console.log("reward state? " +a));

    await staketoken.approve(vault.address, web3.utils.toWei("1000000000.0","ether"),{from:actingUser});
    console.log("approved");
    await setNoGas();
    var tx = await vault.deposit(web3.utils.toWei(depositAmount,"ether"), {from:actingUser});
    console.log("staked, gas: " +tx.receipt.gasUsed);

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    tokenBalance = await staketoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);

    console.log("check reward rates...");
    await poolUtil.rebalancePoolRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));
    await gauge.getBoostRatio(vault.address).then(a=>console.log("boost rate: " +a))

    await gauge.getActiveRewardTokens().then(a=>console.log("active rewards: " +JSON.stringify(a)));
    await vault.earned.call().then(a=>console.log("earned: " +JSON.stringify(a)));

    await fxn.balanceOf(actingUser).then(a=>console.log("balance of fxn: " +a))
    await fxn.balanceOf(poolFeeQueue.address).then(a=>console.log("balance of fxn feeQueue: " +a))
    await cvx.balanceOf(actingUser).then(a=>console.log("balance of cvx: " +a))

    await vault.getReward();
    console.log("rewards claimed");

    await fxn.balanceOf(actingUser).then(a=>console.log("balance of fxn: " +a))
    await fxn.balanceOf(poolFeeQueue.address).then(a=>console.log("balance of fxn feeQueue: " +a))
    await cvx.balanceOf(actingUser).then(a=>console.log("balance of cvx: " +a))


    console.log("withdraw...");

    tokenBalance = await staketoken.balanceOf(actingUser);
    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    console.log("tokenBalance before: " +tokenBalance);

    await vault.withdraw(web3.utils.toWei(depositAmount,"ether"),{from:actingUser});
    console.log("withdraw complete");

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    tokenBalance = await staketoken.balanceOf(actingUser);
    console.log("tokenBalance after: " +tokenBalance);
    

    console.log("check reward rates when no supply...");
    await poolUtil.rebalancePoolRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));
    console.log("---")
    await poolUtil.poolRewardRatesById(poolid).then(a=>console.log(JSON.stringify(a)));
    console.log("done");
    
  });
});


