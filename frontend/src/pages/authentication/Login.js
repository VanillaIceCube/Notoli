import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  TextField,
  Button,
  Typography,
  Box,
  Paper,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function Login({ showSnackbar }) {
  // Basics
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  // Pull Workspace List
  const fetchWorkspaces = useCallback(async (token) => {
    try {
      const response = await fetch("http://localhost:8000/api/workspaces/", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data;
    } catch (err) {
      return [];
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Login function
  const handleLogin = async () => {
    try {
      const { data } = await axios.post("http://localhost:8000/auth/login/", {
        username,
        password,
      });

      // Save tokens
      sessionStorage.setItem("accessToken", data.access);
      sessionStorage.setItem("refreshToken", data.refresh);

      // Update Snackbar
      showSnackbar("success", "Login successful!");

      // Navigate to first Workspace, if empty, navigate to root
      const workspaces = await fetchWorkspaces(data.access);
      if (workspaces.length > 0) {
        navigate(`/workspace/${Math.min(...workspaces.map((ws) => ws.id))}`);
      } else {
        navigate("/");
      }
    } catch (err) {
      // Update Snackbar
      showSnackbar("error", "Login failed :(");
      console.error(err);
    }
  };

  return (
    <Stack
      spacing={2}
      alignItems="center"
      maxWidth="sm"
      sx={{
        p: 5.5,
        mx: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "85vh",
      }}
    >
      <Typography
        variant="h3"
        sx={{ mt: 2, fontWeight: "bold", color: "white" }}
      >
        notoli
      </Typography>
      <Paper
        elevation={3}
        sx={{
          p: 4,
          width: "100%",
          background: "var(--secondary-background-color)",
        }}
      >
        <Box
          component="form"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <TextField
            fullWidth
            sx={{ background: "white" }}
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            fullWidth
            sx={{ background: "white" }}
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            fullWidth
            sx={{ backgroundColor: "var(--secondary-color)" }}
            type="submit"
            variant="contained"
          >
            <Typography variant="h5" align="center">
              Login
            </Typography>
          </Button>
        </Box>
      </Paper>
    </Stack>
  );
}
