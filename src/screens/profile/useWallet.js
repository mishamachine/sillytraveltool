import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Loads one of the user's wallet tables (wallet_documents / loyalty_cards), newest first.
export function useWalletTable(table, user) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const fetchRows = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 10000) // safety timeout
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (!error && alive) setRows(data || [])
    } catch (e) {
      console.error(`fetch ${table} error`, e)
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
    }
    fetchRows()
    return () => { alive = false }
  }, [table, user])

  const remove = async (id) => {
    try {
      await supabase.from(table).delete().eq('id', id)
      setRows(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      console.error(`delete ${table} error`, e)
    }
  }

  const upsertLocal = (saved, isEdit) => {
    if (isEdit) setRows(prev => prev.map(r => r.id === saved.id ? saved : r))
    else setRows(prev => [saved, ...prev])
  }

  return { rows, loading, remove, upsertLocal }
}
