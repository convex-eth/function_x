const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const FxnVoterProxy = artifacts.require("FxnVoterProxy");
const Booster = artifacts.require("Booster");
const FxnDepositor = artifacts.require("FxnDepositor");
const cvxFxnToken = artifacts.require("cvxFxnToken");
const cvxFxnStaking = artifacts.require("cvxFxnStaking");
const FeeDepositV2 = artifacts.require("FeeDepositV2");
const FeeReceiverCvxFxn = artifacts.require("FeeReceiverCvxFxn");
const ICvxDistribution = artifacts.require("ICvxDistribution");

const IDelegation = artifacts.require("IDelegation");
const IWalletChecker = artifacts.require("IWalletChecker");
const IFeeDistro = artifacts.require("IFeeDistro");
const IVoteEscrow = artifacts.require("IVoteEscrow");
const IERC20 = artifacts.require("IERC20");


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

contract("FXN Setup for ui testing", async accounts => {
  it("should successfully run", async () => {
    
    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    let cvx = await IERC20.at(contractList.system.cvx);
    let fxn = await IERC20.at(contractList.fxn.fxn);
    let vefxn = await IERC20.at(contractList.fxn.vefxn);
    let feeDistro = await IFeeDistro.at(contractList.fxn.vefxnRewardDistro);
    let walletChecker = await IWalletChecker.at(contractList.fxn.walletChecker);
    let checkerAdmin = await walletChecker.owner();
    

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

    const advanceTime = async (secondsElaspse) => {
      await time.increase(secondsElaspse);
      await time.advanceBlock();
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;
    await unlockAccount(deployer);
    await unlockAccount(multisig);

    //deploy
    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.at(contractList.system.cvxFxn);
    let fxndeposit = await FxnDepositor.at(contractList.system.fxnDepositor);
    let booster = await Booster.at(contractList.system.booster);
    let staking = await cvxFxnStaking.at(contractList.system.cvxFxnStaking);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefxnRewardQueue);
    let stakingFeeReceiver = await FeeReceiverCvxFxn.at(contractList.system.cvxFxnStakingFeeReceiver);


    console.log("add to whitelist..");
    //add to whitelist
    let voteEscrow = await IVoteEscrow.at(vefxn.address);
    let escrowAdmin = await voteEscrow.admin();
    await unlockAccount(escrowAdmin);
    await unlockAccount(checkerAdmin);
    await voteEscrow.commit_smart_wallet_checker(walletChecker.address,{from:escrowAdmin,gasPrice:0});
    await voteEscrow.apply_smart_wallet_checker({from:escrowAdmin,gasPrice:0});
    await walletChecker.approveWallet(voteproxy.address,{from:checkerAdmin,gasPrice:0});
    console.log("approved wallet");
    let isWhitelist = await walletChecker.check(voteproxy.address);
    console.log("is whitelist? " +isWhitelist);


    console.log("\n >>> test lock >>>\n");
    //get fxn
    var aladdintreasury = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
    await unlockAccount(aladdintreasury);
    await unlockAccount(vefxn.address);
    await fxn.transfer(deployer,web3.utils.toWei("10000.0", "ether"),{from:aladdintreasury,gasPrice:0})
    await fxn.transfer(userA,web3.utils.toWei("1000.0", "ether"),{from:aladdintreasury,gasPrice:0})
    let startingfxn = await fxn.balanceOf(userA);
    console.log("fxn on userA: " +startingfxn);

    //lock fxn directly on proxy
    console.log("transfer some to vote proxy...")
    await fxn.transfer(voteproxy.address, web3.utils.toWei("1000.0", "ether"), {from:deployer});
    await fxn.balanceOf(voteproxy.address).then(a=>console.log("fxn on proxy: " +a));
    //initial lock
    await fxndeposit.initialLock({from:deployer});
    console.log("init locked");
    await voteEscrow.locked__end(voteproxy.address).then(a=>console.log("lock end: " +a));
    await vefxn.balanceOf(voteproxy.address).then(a=>console.log("vefxn: " +a));


    //claim fees
    console.log("distribute fees...");
    var stethholder = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
    await unlockAccount(stethholder);
    var steth = await IERC20.at(contractList.fxn.feeToken);
    await steth.transfer(feeQueue.address,web3.utils.toWei("10.0", "ether"),{from:stethholder,gasPrice:0})
    await fxn.transfer(feeQueue.address, web3.utils.toWei("100.0", "ether"), {from:deployer});
    await booster.claimFees();
    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 500, {from:deployer});

    console.log("claim once to checkpoint..");
    await advanceTime(day*5);
    await fxn.balanceOf(feeQueue.address).then(a=>console.log("fxn on fee queue: " +a));
    await fxn.balanceOf(contractList.system.treasury).then(a=>console.log("fxn on treasury: " +a));
    await fxn.balanceOf(staking.address).then(a=>console.log("fxn on staking: " +a));
    await fxn.balanceOf(stakingFeeReceiver.address).then(a=>console.log("fxn on stakingFeeReceiver: " +a));
    await steth.balanceOf(feeQueue.address).then(a=>console.log("steth on fee queue: " +a));
    await steth.balanceOf(staking.address).then(a=>console.log("steth on staking: " +a));

    await steth.transfer(feeQueue.address,web3.utils.toWei("10.0", "ether"),{from:stethholder,gasPrice:0})
    await fxn.transfer(feeQueue.address, web3.utils.toWei("100.0", "ether"), {from:deployer});
    await booster.claimFees();
    console.log("claimed vefxn rewards -> process fxn/cvx/steth")

    await fxn.balanceOf(feeQueue.address).then(a=>console.log("fxn on fee queue: " +a));
    await fxn.balanceOf(contractList.system.treasury).then(a=>console.log("fxn on treasury: " +a));
    await fxn.balanceOf(staking.address).then(a=>console.log("fxn on staking: " +a));
    await fxn.balanceOf(stakingFeeReceiver.address).then(a=>console.log("fxn on stakingFeeReceiver: " +a));
    await steth.balanceOf(feeQueue.address).then(a=>console.log("steth on fee queue: " +a));
    await steth.balanceOf(staking.address).then(a=>console.log("steth on staking: " +a));

    //earn
    await staking.rewardData(fxn.address).then(a=>console.log("fxn reward data: " +JSON.stringify(a) ))
    await staking.rewardData(cvx.address).then(a=>console.log("cvx reward data: " +JSON.stringify(a) ))
    await staking.rewardData(steth.address).then(a=>console.log("steth reward data: " +JSON.stringify(a) ))


    
  });
});


