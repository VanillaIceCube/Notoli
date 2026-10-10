// Shared inline editor for notepad-style rows; parent pages own the value and save/cancel behavior.
import { Box, IconButton, TextField } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';

const textFieldSx = {
  flexGrow: 1,
  mr: 1,
  justifyContent: 'space-between',
  color: 'var(--secondary-color)',
};

const inputSx = {
  color: 'var(--secondary-color)',
  '&:after': { borderBottomColor: 'var(--secondary-color)' },
};

export default function InlineTextEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  containerSx,
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, ...containerSx }}>
      <TextField
        autoFocus
        variant="standard"
        size="small"
        sx={textFieldSx}
        slotProps={{ input: { sx: inputSx } }}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit();
          if (event.key === 'Escape') onCancel();
        }}
      />
      <IconButton size="small" onClick={onSubmit} disabled={!value.trim()}>
        <Add />
      </IconButton>
      <IconButton size="small" onClick={onCancel}>
        <Close />
      </IconButton>
    </Box>
  );
}
