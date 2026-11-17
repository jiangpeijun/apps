// apps/adyen/src/modules/saleor/webhook-subscriptions.ts

// ✅ 1. 支付网关初始化（修复：currency 在 totalPrice 里面）
export const PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION = `
  subscription PaymentGatewayInitializeSession {
    event {
      ... on PaymentGatewayInitializeSession {
        sourceObject {
          ... on Checkout {
            id
            totalPrice {
              gross {
                amount
                currency
              }
            }
            billingAddress {
              country {
                code
              }
            }
            channel {
              id
            }
          }
        }
      }
    }
  }
`;

// ✅ 2. 交易初始化（补充 sourceObject 里的 id 和 channel）
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
            id
            channel {
              id
            }
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

// ✅ 3. 交易处理（补充 sourceObject 里的 id 和 channel）
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
        sourceObject {
          ... on Checkout {
            id
            channel {
              id
            }
          }
          ... on Order {
            id
            channel {
              id
            }
          }
        }
        customerIpAddress
        data
      }
    }
  }
`;

// 4. 退款请求
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

// 5. 取消请求
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