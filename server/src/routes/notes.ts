import { Router } from 'express';
import { z } from 'zod';
import { noteService } from '../services/noteService';
import { authMiddleware } from './auth';

const router = Router();

// 所有备注路由都需要认证
router.use(authMiddleware);

// 获取用户的所有备注
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const notes = await noteService.getUserNotes(userId);
    
    res.json({
      success: true,
      data: notes,
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notes',
    });
  }
});

// 添加或更新备注
const upsertNoteSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  note: z.string().min(1).max(50),
});

router.post('/', async (req, res) => {
  try {
    const { walletAddress, note } = upsertNoteSchema.parse(req.body);
    const userId = req.user!.id;
    
    const result = await noteService.upsertNote(userId, walletAddress, note);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    console.error('Error saving note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save note',
    });
  }
});

// 删除备注
router.delete('/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress;
    const userId = req.user!.id;
    
    await noteService.deleteNote(userId, walletAddress);
    
    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete note',
    });
  }
});

export { router as notesRouter };

