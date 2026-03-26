import Swal from 'sweetalert2'

export async function openDebtSettlementPrompt({
  outstandingBalance,
  paymentOptions = [],
  title = 'Settle debt sale',
}) {
  const normalizedBalance = Math.max(Number(outstandingBalance || 0), 0)
  const resolvedOptions = paymentOptions.length
    ? paymentOptions
    : [
        { value: 'cash', label: 'Cash' },
        { value: 'gcash', label: 'Online Bank' },
      ]

  const optionsHtml = resolvedOptions
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join('')

  const result = await Swal.fire({
    title,
    html: `
      <div style="display:flex; flex-direction:column; gap:12px; text-align:left; margin-top:12px;">
        <div style="font-size:14px; color:#475569;">Outstanding balance: <strong>₱${normalizedBalance.toFixed(2)}</strong></div>
        <label style="display:flex; flex-direction:column; gap:6px; font-size:14px;">
          <span>Payment amount</span>
          <input id="debt-settlement-amount" type="number" min="0.01" step="0.01" class="swal2-input" style="margin:0; width:100%;" placeholder="Enter amount" />
        </label>
        <label style="display:flex; flex-direction:column; gap:6px; font-size:14px;">
          <span>Payment method</span>
          <select id="debt-settlement-method" class="swal2-select" style="margin:0; width:100%;">
            ${optionsHtml}
          </select>
        </label>
        <label style="display:flex; flex-direction:column; gap:6px; font-size:14px;">
          <span>Note</span>
          <textarea id="debt-settlement-note" class="swal2-textarea" style="margin:0; width:100%; min-height:84px;" placeholder="Optional note"></textarea>
        </label>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Record payment',
    cancelButtonText: 'Cancel',
    preConfirm: () => {
      const amountField = document.getElementById('debt-settlement-amount')
      const methodField = document.getElementById('debt-settlement-method')
      const noteField = document.getElementById('debt-settlement-note')

      const amount = Number(amountField?.value)
      if (!Number.isFinite(amount) || amount <= 0) {
        Swal.showValidationMessage('Enter a valid payment amount.')
        return false
      }

      if (amount > normalizedBalance) {
        Swal.showValidationMessage(`Payment amount cannot exceed ₱${normalizedBalance.toFixed(2)}.`)
        return false
      }

      return {
        amount,
        paymentMethod: methodField?.value || resolvedOptions[0]?.value || 'cash',
        note: String(noteField?.value || '').trim(),
      }
    },
  })

  return result.isConfirmed ? result.value : null
}