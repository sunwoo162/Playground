interface EmojiPickerProps {
  selected: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_LIST = [
  '⭐', '🌟', '💫', '✨', '🎯', '🏆', '🎉', '🎊',
  '💪', '🔥', '❤️', '💖', '💚', '💙', '💜', '🧡',
  '🌈', '☀️', '🌙', '⚡', '🍀', '🌸', '🌺', '🌻',
  '🎵', '🎨', '📚', '✏️', '💡', '🧠', '👑', '🦋',
  '🐱', '🐶', '🐻', '🦊', '🐰', '🐸', '🐝', '🦄',
  '🍎', '🍕', '🍜', '☕', '🧋', '🍰', '🥗', '🥤',
  '🏃', '🧘', '🚴', '⛹️', '🏊', '🧗', '🎿', '🏄',
  '💻', '📱', '🎮', '📷', '🔬', '🛠️', '🚀', '🌍',
];

export function EmojiPicker({ selected, onSelect, onClose }: EmojiPickerProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="emoji-picker-content" onClick={(e) => e.stopPropagation()}>
        <div className="emoji-picker-header">
          <span>이모지 선택</span>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="emoji-grid">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              className={`emoji-option ${emoji === selected ? 'selected' : ''}`}
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
