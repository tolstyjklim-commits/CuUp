
app.post('/api/admin/withdrawals/:id/decision', adminOnly, async (req, res) => {
  const id = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id

  const decision = req.body?.decision

  if (!id || !['paid', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision or request ID' })
  }

  const result = await prisma.$transaction(async tx => {
    const row = await tx.withdrawalRequest.findUnique({
      where: { id }
    })

    if (!row || row.status !== 'pending') {
      throw new Error('REQUEST_NOT_PENDING')
    }

    const updated = await tx.withdrawalRequest.update({
      where: { id: row.id },
      data: {
        status: decision,
        adminNote: String(req.body?.note || '').slice(0, 500)
      }
    })

    if (decision === 'rejected') {
      await tx.wallet.update({
        where: { userId: row.userId },
        data: { balance: { increment: row.amount } }
      })

      await tx.transaction.create({
        data: {
          userId: row.userId,
          amount: row.amount,
          type: 'withdrawal_release',
          status: 'completed',
          description: `Rejected withdrawal ${row.id}; funds returned`
        }
      })
    } else {
      await tx.transaction.updateMany({
        where: {
          userId: row.userId,
          type: 'withdrawal_hold',
          description: `Withdrawal request ${row.id}`
        },
        data: { status: 'completed' }
      })
    }

    return updated
  }).catch(e => {
    if (e instanceof Error && e.message === 'REQUEST_NOT_PENDING') {
      return null
    }
    throw e
  })

  if (!result) {
    return res.status(409).json({
      error: 'Request not found or already processed'
    })
  }

  res.json({ id: result.id, status: result.status })
})
