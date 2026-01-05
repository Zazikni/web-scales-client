import { http } from "./http";

export async function registerUser({ email, password }) {
  const resp = await http.post("/auth/register", { email, password });
  return resp.data;
}


export async function loginUser({ email, password }) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  const resp = await http.post("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return resp.data; // { access_token, token_type }
}
