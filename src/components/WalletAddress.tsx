import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotes } from '../contexts/NotesContext';

interface WalletAddressProps {
  address: string;
  linkTo?: string; // 如果提供，点击地址会跳转
  showFullAddress?: boolean;
  className?: string;
}

export function WalletAddress({ 
  address, 
  linkTo, 
  showFullAddress = false,
  className = ''
}: WalletAddressProps) {
  const { isAuthenticated } = useAuth();
  const { getNote, saveNote, deleteNote } = useNotes();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const note = getNote(address);
  const displayAddress = showFullAddress 
    ? address 
    : `${address.slice(0, 6)}...${address.slice(-4)}`;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(note || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue) {
      await saveNote(address, trimmedValue);
    } else if (note) {
      await deleteNote(address);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  // 编辑模式
  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="输入备注名..."
          maxLength={50}
          className="px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-accent-primary)] rounded text-sm text-[var(--color-text-primary)] outline-none w-32"
        />
        <span className="text-xs text-[var(--color-text-muted)]">
          回车保存
        </span>
      </div>
    );
  }

  // 显示模式
  const addressContent = (
    <span className="font-mono text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent-primary)] transition-colors">
      {note ? (
        <span className="text-[var(--color-accent-blue)]">{note}</span>
      ) : (
        displayAddress
      )}
    </span>
  );

  return (
    <div className={`flex items-center gap-2 group ${className}`}>
      {linkTo ? (
        <Link to={linkTo} className="hover:underline">
          {addressContent}
        </Link>
      ) : (
        addressContent
      )}
      
      {/* 备注时显示原地址 */}
      {note && (
        <span className="text-xs text-[var(--color-text-muted)] font-mono">
          ({displayAddress})
        </span>
      )}
      
      {/* 编辑按钮 - 只在登录后显示 */}
      {isAuthenticated && (
        <button
          onClick={handleStartEdit}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--color-bg-tertiary)] rounded transition-all"
          title={note ? '修改备注' : '添加备注'}
        >
          <svg 
            className="w-3.5 h-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
            />
          </svg>
        </button>
      )}
    </div>
  );
}

