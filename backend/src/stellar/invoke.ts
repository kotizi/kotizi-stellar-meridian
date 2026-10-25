import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

export const u32 = (n: number) => nativeToScVal(n, { type: 'u32' });
export const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' });
export const addr = (a: string) => new Address(a).toScVal();
export const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));

/** HostFunction invoking `fn` on `contractId`. */
export function invokeFunc(contractId: string, fn: string, args: xdr.ScVal[]): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(contractId).toScAddress(),
      functionName: fn,
      args,
    }),
  );
}
