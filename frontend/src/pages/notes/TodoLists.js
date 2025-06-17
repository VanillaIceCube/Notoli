import React, { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Paper,
  Stack,
  Button,
} from '@mui/material';
import { Add, ArrowForward } from '@mui/icons-material';

export default function TodoLists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If I launch with docker containers, I think this is okay to hardcode?
    fetch('http://localhost:8000/api/todolists/')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => setLists(data))
      .catch(err => setError(err.toString()))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Container
      maxWidth="sm"
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        py: 2,
      }}
    >
      <Paper elevation={3} sx={{ p: 2, width: '100%' }}>
        {/* Header */}
        <Typography variant="h5" align="center" gutterBottom>
          Todo Lists 
        </Typography>

        {/* This is for loading */}
        {loading && (
          <Typography align="center">Loading…</Typography>
        )}
        
        {/* This is for errors */}
        {error && (
          <Typography color="error" align="center">
            Error: {error}
          </Typography>
        )}

        {/* If we're done loading and there are no errors */}
        {!loading && !error && (
          <Stack spacing={2}>
            {lists.length
              ? lists.map(list => (
                <Button
                  key={list.id}
                  variant="contained"
                  startIcon={<ArrowForward/>}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'left'
                  }}
                >
                  <Typography> {list.name} </Typography>
                </Button>
                ))
              : (
                <Typography align="center">
                  No to-do lists found.
                </Typography>
              )
            }
            <Button
              variant="contained"
              startIcon={<Add/>}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'left',
              }}
            >
              <Typography> Add New </Typography>
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
