// apps/adyen/src/modules/saleor/webhook-subscriptions.ts

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
          checkout {
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
        }
      }
    }
  }
`;

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