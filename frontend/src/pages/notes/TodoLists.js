import React, { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Paper,
  Stack,
  Button,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import Divider from '@mui/material/Divider';

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
      <Paper elevation={3} sx={{ px: 1.5, py: 1.5, width: '100%', background:'var(--secondary-background-color)' }}>
        {/* Header */}
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{
            mt: 1.5,
            fontWeight: 'bold',
            color: 'var(--secondary-color)'
          }}
        >
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
        <Divider sx={{ borderBottomWidth: 2, marginBottom: 1 }} />
        {!loading && !error && (
          <Stack spacing={1}>
            {lists.length
              ? lists.map(list => (
                <>
                  <Button
                    key={list.id}
                    variant="text"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'left',
                      background:'var(--secondary-background-color)',
                      color: 'var(--secondary-color)',
                    }}
                  >
                    <Typography variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                      {list.name}
                    </Typography>
                  </Button>
                  <Divider sx={{ borderBottomWidth: 2 }} />
                </>
              ))
              : (
                <Typography aligh="center" variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                  No to-do lists found.
                </Typography>
              )
            }
            <Button
              variant="text"
              startIcon={<Add/>}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'left',
                background:'var(--secondary-background-color)',
                color: 'var(--secondary-color)',
              }}
            >
              <Typography aligh="center" variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                Add New
              </Typography>
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
