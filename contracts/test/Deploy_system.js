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
const Burner = artifacts.require("Burner");
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

contract("cvxFXN Deploy", async accounts => {
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

    // const advanceTime = async (secondsElaspse) => {
    //   await time.increase(secondsElaspse);
    //   await time.advanceBlock();
    //   console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    // }
    // const day = 86400;
    await unlockAccount(deployer);
    

    //deploy
    // let voteproxy = await FxnVoterProxy.new({from:deployer});
    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.new(voteproxy.address,{from:deployer});
    let fxndeposit = await FxnDepositor.new(voteproxy.address, cvxfxn.address, {from:deployer});
    let booster = await Booster.new(voteproxy.address, fxndeposit.address, cvxfxn.address, {from:deployer});
    let staking = await cvxFxnStaking.new(voteproxy.address, cvxfxn.address, fxndeposit.address, {from:deployer});
    let stakingFeeReceiver = await FeeReceiverCvxFxn.new(staking.address, voteproxy.address, {from:deployer});
    let feeQueue = await FeeDepositV2.new(voteproxy.address, cvxfxn.address, stakingFeeReceiver.address, {from:deployer});
    let burner = await Burner.new(cvxfxn.address,{from:deployer});

    contractList.system.voteProxy = voteproxy.address;
    contractList.system.booster = booster.address;
    contractList.system.cvxFxn = cvxfxn.address;
    contractList.system.burner = burner.address;
    contractList.system.fxnDepositor = fxndeposit.address;
    contractList.system.cvxFxnStaking = staking.address;
    contractList.system.cvxFxnStakingFeeReceiver = stakingFeeReceiver.address;
    contractList.system.vefxnRewardQueue = feeQueue.address;
    jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });

    console.log("deployed");

    await voteproxy.setOperator(booster.address,{from:deployer});
    await voteproxy.setDepositor(fxndeposit.address,{from:deployer});
    await booster.setTokenMinter(fxndeposit.address, true, {from:deployer});
    await booster.setTokenMinter(burner.address, true, {from:deployer});
    console.log("operators set");

    await booster.setFeeQueue(feeQueue.address, true, {from:deployer});
    await booster.setFeeToken(contractList.fxn.feeToken, contractList.fxn.vefxnRewardDistro, {from:deployer});
    await stakingFeeReceiver.setRewardToken(contractList.fxn.feeToken, {from:deployer});
    await feeQueue.setRewardToken(contractList.fxn.feeToken, {from:deployer});
    await staking.addReward(fxn.address, stakingFeeReceiver.address, {from:deployer});
    await staking.addReward(cvx.address, stakingFeeReceiver.address, {from:deployer});
    await staking.addReward(contractList.fxn.feeToken, stakingFeeReceiver.address, {from:deployer});
    console.log("staking params set")

    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 100, {from:deployer});
    await cvxdistro.setWeight(contractList.system.treasury, 6650, {from:deployer});
    console.log("cvx emissions set");

    
    console.log(contractList.system);

    console.log("done");
    
  });
});


