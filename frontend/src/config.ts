const LOCAL_API_URL = "http://localhost:8001";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || LOCAL_API_URL;
