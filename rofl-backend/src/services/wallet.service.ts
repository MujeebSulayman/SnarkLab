import { z } from 'zod';
import { verifyWalletSignature } from '../utils/wallet.util';
import { TransferRequest, TransferResult } from '../types/wallet.types';
import { AppError } from '../api/middlewares/errorHandler';
import { getBalance, updateBalance, getRoot } from './balance.service';
import { addTransaction, getTxRoot } from './transaction.service';
import { hasAllSecrets } from './secret.service';
import { env } from '../config/env';

const transferSchema = z.object({
  sendTransaction: z.object({
    from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid from address'),
    to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid to address'),
    token: z.string().min(1, 'Token is required'),
    amount: z.string().min(1, 'Amount is required'),
  }),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
});

export class WalletService {
  async transfer(body: TransferRequest): Promise<TransferResult> {
    const validated = transferSchema.parse(body);
    const { sendTransaction, signature } = validated;

    if (sendTransaction.from.toLowerCase() === sendTransaction.to.toLowerCase()) {
      throw new AppError('Cannot transfer to yourself', 400);
    }

    const message = JSON.stringify(sendTransaction);
    const result = await verifyWalletSignature({
      walletAddress: sendTransaction.from,
      signature,
      message,
    });

    if (!result.isValid) {
      throw new AppError(result.error || 'Invalid signature', 401);
    }

    const senderHasSecrets = await hasAllSecrets(sendTransaction.from);

    if (!senderHasSecrets) {
      throw new AppError('Sender has not set all required secrets', 400);
    }

    const receiverHasSecrets = await hasAllSecrets(sendTransaction.to);
    
    if (!env.SKIP_RECEIVER_SECRET_CHECK && !receiverHasSecrets) {
      throw new AppError('Receiver has not set all required secrets', 400);
    }

    const senderBalance = await getBalance(sendTransaction.from, sendTransaction.token);
    const amount = parseFloat(sendTransaction.amount);
    const currentBalance = parseFloat(senderBalance);

    if (currentBalance < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    const newSenderBalance = (currentBalance - amount).toString();
    await updateBalance(sendTransaction.from, sendTransaction.token, newSenderBalance);

    if (receiverHasSecrets) {
      const receiverBalance = await getBalance(sendTransaction.to, sendTransaction.token);
      const newReceiverBalance = (parseFloat(receiverBalance) + amount).toString();
      await updateBalance(sendTransaction.to, sendTransaction.token, newReceiverBalance);
    }

    if (receiverHasSecrets) {
      await addTransaction(
        sendTransaction.from,
        sendTransaction.to,
        sendTransaction.token,
        sendTransaction.amount
      );
    }

    const txHash = getRoot();

    return {
      txHash,
      from: sendTransaction.from,
      to: sendTransaction.to,
      token: sendTransaction.token,
      amount: sendTransaction.amount,
    };
  }
}
