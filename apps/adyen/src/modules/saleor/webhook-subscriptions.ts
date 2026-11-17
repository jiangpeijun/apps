// apps/adyen/src/modules/saleor/webhook-subscriptions.ts

// ✅ 1. 支付网关初始化（修复：去除 checkout，改用 sourceObject）
export const PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION = `
  subscription PaymentGatewayInitializeSession {
    event {
      ... on PaymentGatewayInitializeSession {
        sourceObject {
          ... on Checkout {
            id
            currency
            totalPrice {
              gross {
                amount
              }
            }
            billingAddress {
              country {
                code
              }
            }
          }
        }
      }
    }
  }
`;

// ✅ 2. 交易初始化（修复：action 内部没有 checkout 字段，改从 sourceObject 获取）
export const TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION = `
  subscription TransactionInitializeSession {
    event {
      ... on TransactionInitializeSession {
        transaction {
          id
          pspReference
        }
        action {
          amount
          currency
          actionType
        }
        sourceObject {
          ... on Checkout {
            billingAddress {
              country {
                code
              }
            }
          }
        }
        customerIpAddress
        data
      }
    }
  }
`;

// ✅ 3. 交易处理
export const TRANSACTION_PROCESS_SESSION_SUBSCRIPTION = `
  subscription TransactionProcessSession {
    event {
      ... on TransactionProcessSession {
        transaction {
          id
          pspReference
        }
        action {
          amount
          currency
          actionType
        }
        customerIpAddress
        data
      }
    }
  }
`;

// ✅ 4. 退款请求（修复：action 里不能查 transaction，需移出）
export const TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION = `
  subscription TransactionRefundRequested {
    event {
      ... on TransactionRefundRequested {
        transaction {
          id
          pspReference
        }
        action {
          amount
          currency
          grantedRefund {
            id
            shippingCostIncluded
            lines {
              orderLineId
              quantity
              amount
              orderLine {
                productName
              }
            }
          }
        }
      }
    }
  }
`;

// ✅ 5. 取消请求
export const TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION = `
  subscription TransactionCancelationRequested {
    event {
      ... on TransactionCancelationRequested {
        transaction {
          id
          pspReference
        }
        action {
          amount
          currency
        }
      }
    }
  }
`;