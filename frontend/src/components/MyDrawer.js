import {
  Drawer,
  Toolbar,
  Box,
  List,
  ListItemButton,
  ListItemText
} from '@mui/material';

export default function MyDrawer({ open, onClose }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
    >
      <Toolbar /> {/* pushes content below AppBar */}
      <Box role="navigation">
        <List>
          <ListItemButton>
            <ListItemText primary="Workspaces" />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary="Settings" />
          </ListItemButton>
        </List>
      </Box>
    </Drawer>
  );
}