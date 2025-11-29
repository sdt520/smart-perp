import { db } from '../db/index.js';

export interface WalletNote {
  walletAddress: string;
  note: string;
}

interface NoteRow {
  wallet_address: string;
  note: string;
}

export const noteService = {
  // 获取用户的所有备注
  async getUserNotes(userId: number): Promise<WalletNote[]> {
    const result = await db.query<NoteRow>(
      `SELECT wallet_address, note FROM wallet_notes WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map(row => ({
      walletAddress: row.wallet_address,
      note: row.note,
    }));
  },

  // 添加或更新备注
  async upsertNote(userId: number, walletAddress: string, note: string): Promise<WalletNote> {
    const result = await db.query<NoteRow>(
      `INSERT INTO wallet_notes (user_id, wallet_address, note, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, wallet_address) 
       DO UPDATE SET note = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING wallet_address, note`,
      [userId, walletAddress.toLowerCase(), note.trim()]
    );
    return {
      walletAddress: result.rows[0].wallet_address,
      note: result.rows[0].note,
    };
  },

  // 删除备注
  async deleteNote(userId: number, walletAddress: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM wallet_notes WHERE user_id = $1 AND wallet_address = $2`,
      [userId, walletAddress.toLowerCase()]
    );
    return (result.rowCount ?? 0) > 0;
  },
};

