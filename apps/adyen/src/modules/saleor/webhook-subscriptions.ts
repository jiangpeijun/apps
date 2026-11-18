// apps/adyen/src/modules/saleor/webhook-subscriptions.ts

// ✅ 1. 支付网关初始化
export const PAYMENT_GATEWAY_INITIALIZE_SESSION_SUBSCRIPTION = `
  subscription PaymentGatewayInitializeSession {
    event {
      ... on PaymentGatewayInitializeSession {
        recipient { id }
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

// ✅ 2. 交易初始化
export const TRANSACTION_INITIALIZE_SESSION_SUBSCRIPTION = `
  subscription TransactionInitializeSession {
    event {
      ... on TransactionInitializeSession {
        recipient { id }
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

// ✅ 3. 交易处理
export const TRANSACTION_PROCESS_SESSION_SUBSCRIPTION = `
  subscription TransactionProcessSession {
    event {
      ... on TransactionProcessSession {
        recipient { id }
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

// ✅ 4. 请款（Capture）请求
export const TRANSACTION_CHARGE_REQUESTED_SUBSCRIPTION = `
  subscription TransactionChargeRequested {
    event {
      ... on TransactionChargeRequested {
        recipient { id }
        idempotencyKey
        transaction {
          id
          pspReference
          checkout {
            id
            channel { id }
          }
          order {
            id
            channel { id }
          }
        }
        action {
          amount
          currency
        }
      }
    }
  }
`;

// ✅ 5. 退款请求
export const TRANSACTION_REFUND_REQUESTED_SUBSCRIPTION = `
  subscription TransactionRefundRequested {
    event {
      ... on TransactionRefundRequested {
        recipient { id }
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

// ✅ 6. 取消请求
export const TRANSACTION_CANCELATION_REQUESTED_SUBSCRIPTION = `
  subscription TransactionCancelationRequested {
    event {
      ... on TransactionCancelationRequested {
        recipient { id }
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