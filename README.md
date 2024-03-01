# Convex-Function(x) Staking Platform

## Overview

The Convex-Function(x) staking platform allows users to trustlessly stake positions on the Function(x) Gauge system while borrowing Convex's boosting power via veFXN. The Convex system creates unique proxy vaults for each user which only they can control.  This isolates deposits and keeps the user in control of their funds without any risk of admin controls gaining access.  These proxies are then given permission to share in using Convex's veFXN which increases farming efficiency.  In return for this boost, Convex takes a percentage of FXN farmed as a fee.

## Pool Creation Flow

#### Convex Creates Vault Implementation Contracts
This implmentation contract is a proxy staking interface to the underlying gauge. Allowing various implementations allows Convex to adapt to different products and staking contracts. For example, erc20 staking and uniswap v3 nft staking.
(Reference: StakingProxyERC20.sol)

#### Convex Creates A Pool And Assigns An Implementation
A pool is created with an implementation address and other important information like the gauge address.  A reward contract is also created to allow additional rewards outside of the gauge system.
(Reference: PoolRegistry.sol, MultiRewards.sol, Booster.sol)

#### Pools Can Be Marked Inactive To Stop Vault Creation
User vaults created from pools are immutable and can not be removed. However Convex can halt future production of vaults.  This will allow things like migrations if required.
(Reference: PoolRegistry.sol, Booster.sol)

## General User Flow

#### User Creates A Personal Vault
A user first clones a pool's implementation contract and assigns themselves as the owner. Only the owner can interact with this proxy vault.
(Reference: Booster.sol, PoolRegistry.sol)

#### Convex Enables User Vault To Use Its veFXN Boosting Power
At time of creation, Convex tells the underlying gauge contract that the user vault can share in Convex's boosting power via veFXN.
(Reference: Booster.sol, StakingProxyBase.sol)

#### User Interacts with Vault As A Proxy To Stake On Function(x)'s Gauge System
Users interact with the proxy vault in the same way they would interact with the underlying gauge contract.
(Reference: StakingProxyERC20.sol)

#### When User Rewards Are Claimed, A Fee Is Applied To FXN Tokens
Users can claim rewards as they see fit.  Any FXN tokens claimed will have a fee applied and sent to the Convex system to be dispersed to various token holders. Tokens outside of FXN will be claimed directly to the owner of the vault via the gauge's setRewardReceiver() function.
(Reference: StakingProxyERC20.sol, FeeRegistry.sol )


## Design Decisions

- User funds are controlled soley by user owned "vaults". Admin never has access to funds.
- Vault functions that admin does keep control of relates to boost (set what vefxn proxy a vault uses) and fees.
- There are hard coded upper limits to fees.
- Creating a vault requires an extra transaction to begin. Why vaults? Funds are never co-mingled with other users. Rewards are directly linked to the vault so no trailing reward structure or harvesting is required.  Allow users to execute arbitrary functions within limits (example: claim an airdrop).  
