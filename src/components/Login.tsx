import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { Background3D } from './Background3D';

const PTBLogoIcon = () => (
  <svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <polygon points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30" stroke="#1e40af" strokeWidth="8" fill="none"/>
    <text x="50" y="60" fill="#1e40af" fontSize="26" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="-1">PTB</text>
  </svg>
);

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempt for:', username);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Invalid credentials');
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      if (data.user) {
        login(data.user);
        toast.success('Welcome back!');
      } else {
        toast.error('Failed to log in');
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error('An error occurred during login. Check server connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-4 relative overflow-hidden">
      {/* 3D Depth Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)] opacity-[0.35] pointer-events-none z-0" />
      
      {/* Glowing background spheres to match the 3D canvas */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] rounded-full bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent blur-[100px] pointer-events-none z-0 animate-pulse duration-[8000ms]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] rounded-full bg-gradient-to-tr from-emerald-400/10 via-teal-400/5 to-transparent blur-[100px] pointer-events-none z-0 animate-pulse duration-[10000ms]" />
      
      <Background3D />

      <Card className="w-full max-w-md border-white/40 bg-white/45 backdrop-blur-xl shadow-[0_20px_50px_rgba(30,58,138,0.06)] relative z-10">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-1 transform hover:rotate-6 transition-transform">
              <PTBLogoIcon />
            </div>
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-[#1e3a8a]">POOJA TEKNOBELT</CardTitle>
          <CardDescription className="text-zinc-500">Enter your credentials to access the portal</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Username</Label>
              <Input
                id="username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-white/80 border-blue-200 rounded-[6px] focus:border-blue-600 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/80 border-blue-200 rounded-[6px] focus:border-blue-600 focus:ring-blue-100"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button type="submit" className="w-full bg-[#1e40af] hover:bg-[#1d4ed8] text-white font-semibold shadow-md active:scale-[0.98] transition-transform cursor-pointer">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
