// Shared three-dot row menu for notepad-style pages; parent pages decide which row is selected.
import { Menu, MenuItem } from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Reorder from '@mui/icons-material/Reorder';
import Divider from '@mui/material/Divider';

const menuPaperSx = {
  backgroundColor: 'var(--secondary-background-color)',
  color: 'var(--secondary-color)',
  boxShadow: 3,
  border: '2.5px solid var(--background-color)',
  borderRadius: 1.5,
};

const menuItemSx = { py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' };
const dividerSx = {
  my: 0,
  mx: 1,
  borderBottomWidth: 2,
  bgcolor: 'var(--secondary-color)',
};
const menuIconSx = { mr: 1, fontSize: 18 };

export default function NotepadRowActionMenu({
  anchorEl,
  open,
  onClose,
  onRename,
  onReorder,
  onRemove,
  reorderDisabled = false,
}) {
  return (
    <Menu
      slotProps={{ paper: { sx: menuPaperSx } }}
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
    >
      <MenuItem sx={menuItemSx} onClick={onRename}>
        <Edit sx={menuIconSx} />
        Rename
      </MenuItem>
      <Divider variant="middle" sx={dividerSx} />
      <MenuItem sx={menuItemSx} onClick={onReorder} disabled={reorderDisabled}>
        <Reorder sx={menuIconSx} />
        Reorder
      </MenuItem>
      <Divider variant="middle" sx={dividerSx} />
      <MenuItem sx={menuItemSx} onClick={onRemove}>
        <Delete sx={menuIconSx} />
        Remove
      </MenuItem>
    </Menu>
  );
}
