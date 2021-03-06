import React, {
  ComponentType,
  createContext,
  FunctionComponent,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

import { AccAddress } from "@chainapsis/cosmosjs/common/address";
import { Coin } from "@chainapsis/cosmosjs/common/coin";
import { Currency } from "../../../common/currency";
import { Int } from "@chainapsis/cosmosjs/common/int";
import { Msg } from "@chainapsis/cosmosjs/core/tx";
import { MsgSend } from "@chainapsis/cosmosjs/x/bank";
import { MsgExecuteContract } from "@chainapsis/cosmosjs/x/wasm";

type TxStateErrorType = "recipient" | "amount" | "memo" | "fees" | "gas";

// Used for collecting the information related to sending tx.
// This doesn't use reducer/dispatch pattern because this is relatively simple
// and doesn't act as global state and act as the pipeline for the components to handle the tx information.
export interface TxState {
  rawAddress: string;
  recipient: AccAddress | null;
  amount: Coin | null;

  gas: number;
  // TODO: Gas adjustment
  fees: Coin[];
  memo: string;

  // List of currencies to send
  currencies: Currency[];
  // List of currecies to be able to be used for fee
  feeCurrencies: Currency[];

  // Balances of account to send tx
  balances: Coin[];

  // Generate the send message according to the type.
  // Remember that the coin's actual denom should start with "type:contractAddress:" if it is for the token based on contract.
  generateSendMsg(sender: AccAddress): Promise<Msg>;

  // TODO: Check the equality of the object value to prevent the infinite render.
  setRawAddress(rawAddress: string): void;
  setRecipient(recipient: AccAddress | null): void;
  setAmount(amount: Coin | null): void;

  setGas(gas: number): void;
  setFees(fees: Coin[]): void;
  setMemo(memo: string): void;

  setCurrencies(currencies: Currency[]): void;
  setFeeCurrencies(currencies: Currency[]): void;

  setBalances(balances: Coin[]): void;

  // Set error to specific type or remove the error if msg is null.
  setError(type: TxStateErrorType, id: string, msg: string | null): void;
  getError(type: TxStateErrorType, id: string): string | null;
  // Check the type is inputted and there are no errors on the type.
  isValid(type: TxStateErrorType, ...types: TxStateErrorType[]): boolean;
}

const TxContext = createContext<TxState | undefined>(undefined);

export const TxStateProvider: FunctionComponent = ({ children }) => {
  const [rawAddress, setRawAddress] = useState<string>("");
  const [recipient, setRecipient] = useState<AccAddress | null>(null);
  const [amount, setAmount] = useState<Coin | null>(null);

  const [gas, setGas] = useState(0);
  const [fees, _setFees] = useState<Coin[]>([]);
  const setFees = useCallback(
    (argFees: Coin[]) => {
      if (fees.toString() !== argFees.toString()) {
        _setFees(argFees);
      }
    },
    [fees]
  );
  const [memo, setMemo] = useState<string>("");

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [feeCurrencies, setFeeCurrencies] = useState<Currency[]>([]);

  const [balances, setBalances] = useState<Coin[]>([]);

  const generateSendMsg = useCallback(
    async (sender: AccAddress) => {
      if (!recipient || !amount) {
        throw new Error("recipient or amount is not set");
      }

      // Remember that the coin's actual denom should start with "type:contractAddress:" if it is for the token based on contract.
      const split = amount.denom.split(/(\w+):(\w+):(\w+)/).filter(Boolean);
      if (split.length === 3) {
        // If token based on the contract.
        switch (split[0]) {
          case "cw20":
            return new MsgExecuteContract(
              sender,
              AccAddress.fromBech32(split[1]),
              {
                transfer: {
                  recipient: recipient.toBech32(),
                  amount: amount.amount.toString()
                }
              },
              []
            );
          default:
            throw new Error("Unknown type of token");
        }
      } else {
        return new MsgSend(sender, recipient, [amount]);
      }
    },
    [amount, recipient]
  );

  const [errors, setErrors] = useState<any>({});

  const setContextErrors = useCallback(
    (type: TxStateErrorType, id: string, error: string | null): void => {
      const errObj = Object.assign({}, errors);
      if (!errObj[type]) {
        errObj[type] = {};
      }

      if (error != null) {
        if (errObj[type][id] !== error) {
          errObj[type][id] = error;
          setErrors(errObj);
        }
      } else {
        if (errObj[type][id] != null) {
          delete errObj[type][id];
          setErrors(errObj);
        }
      }
    },
    [errors]
  );

  const getError = useCallback(
    (type: TxStateErrorType, id: string): string | null => {
      if (errors && errors[type] && errors[type][id]) {
        return errors[type][id];
      }
      return null;
    },
    [errors]
  );

  const isValid = useCallback(
    (type: TxStateErrorType, ...types: TxStateErrorType[]): boolean => {
      for (const typ of [type].concat(types)) {
        switch (typ) {
          case "recipient":
            if (!recipient) {
              return false;
            }
            break;
          case "amount":
            if (!amount || amount.amount.lte(new Int(0))) {
              return false;
            }
            break;
          // Memo is optionnal.
          case "memo":
            break;
          case "fees":
            if (fees.length === 0) {
              return false;
            }
            break;
          case "gas":
            if (gas <= 0) {
              return false;
            }
            break;
          default:
            throw new Error("Invalid tx state error type");
        }

        if (errors[typ] && Object.keys(errors[typ]).length > 0) {
          return false;
        }
      }

      return true;
    },
    [amount, errors, fees.length, gas, recipient]
  );

  return (
    <TxContext.Provider
      value={useMemo(
        () => ({
          rawAddress,
          recipient,
          amount,
          gas,
          fees,
          memo,
          currencies,
          balances,
          feeCurrencies,
          generateSendMsg,
          setRawAddress,
          setRecipient,
          setAmount,
          setGas,
          setFees,
          setMemo,
          setCurrencies,
          setFeeCurrencies,
          setBalances,
          setError: setContextErrors,
          getError,
          isValid
        }),
        [
          rawAddress,
          recipient,
          amount,
          gas,
          fees,
          memo,
          currencies,
          balances,
          feeCurrencies,
          generateSendMsg,
          setFees,
          setContextErrors,
          getError,
          isValid
        ]
      )}
    >
      {children}
    </TxContext.Provider>
  );
};

export function useTxState() {
  const state = useContext(TxContext);
  if (!state) throw new Error("You probably forgot to use TxStateProvider");
  return state;
}

// HoC for wrapping component with TxStateProvider
export const withTxStateProvider: <T>(
  Component: ComponentType<T>
) => FunctionComponent<T> = Component => {
  // eslint-disable-next-line react/display-name
  return props => (
    <TxStateProvider>
      <Component {...props} />
    </TxStateProvider>
  );
};
