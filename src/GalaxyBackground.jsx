import React, { useEffect, useRef } from 'react';

export default function GalaxyBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width, height;
    
    const stars = [];
    const shootingStars = [];
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', resize);
    resize();
    
    const handleMouseMove = (e) => {
      // Sleek subtle parallax
      mouseX = (e.clientX - width / 2) * 0.04;
      mouseY = (e.clientY - height / 2) * 0.04;
    };
    
    window.addEventListener('mousemove', handleMouseMove);

    // Monochrome Palette for premium sleek look
    const colors = ['#ffffff', '#f8fafc', '#e2e8f0', '#94a3b8'];

    class Star {
      constructor() {
        // Spread stars infinitely beyond screen bounds
        this.x = (Math.random() - 0.5) * width * 2.5; 
        this.y = (Math.random() - 0.5) * height * 2.5;
        this.z = Math.random() * 3 + 0.5; // Depth for parallax
        
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.baseAlpha = Math.random() * 0.5 + 0.1;
        this.speed = (Math.random() * 0.0004) + 0.0001; // Ultra slow, organic rotation
        this.radius = Math.random() * 0.8 + 0.2; // Tiny dust-like stars
        
        this.twinkleSpeed = Math.random() * 0.01 + 0.005;
        this.timeOffset = Math.random() * 1000;
        
        // Precompute distance and angle from center for orbit
        this.dist = Math.sqrt(this.x * this.x + this.y * this.y);
        this.angle = Math.atan2(this.y, this.x);
      }
      
      update() {
        this.angle += this.speed;
        
        const currentX = Math.cos(this.angle) * this.dist;
        const currentY = Math.sin(this.angle) * this.dist;

        const px = currentX + (width / 2) + targetX * this.z;
        const py = currentY + (height / 2) + targetY * this.z;
        
        return { px, py };
      }

      draw(time) {
        const { px, py } = this.update();
        
        // Optimization: Only render if visibly on screen
        if (px < -50 || px > width + 50 || py < -50 || py > height + 50) return;
        
        const alpha = this.baseAlpha + Math.sin(time * this.twinkleSpeed + this.timeOffset) * 0.3;
        
        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha));
        ctx.arc(px, py, this.radius * (this.z * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    class ShootingStar {
      constructor() {
        this.reset();
      }
      
      reset() {
        this.active = false;
        this.x = Math.random() * width * 1.5;
        this.y = -100;
        this.length = Math.random() * 80 + 40;
        this.speed = Math.random() * 15 + 10;
        this.angle = Math.PI / 4 + (Math.random() * 0.2 - 0.1); // ~45 degree angle
        this.alpha = 0;
        this.fadeRate = 0.02;
        
        // Random timeout before spawning
        setTimeout(() => { 
          this.active = true; 
          this.alpha = 1; 
        }, Math.random() * 10000 + 2000);
      }
      
      draw() {
        if (!this.active) return;
        
        this.x -= Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.alpha -= this.fadeRate;
        
        if (this.alpha <= 0 || this.y > height + 100) {
          this.reset();
          return;
        }

        const tailX = this.x + Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;

        const grad = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255, 255, 255, ${this.alpha})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
    }

    // Initialize Universe
    for (let i = 0; i < 1500; i++) stars.push(new Star());
    for (let i = 0; i < 4; i++) shootingStars.push(new ShootingStar());

    let time = 0;
    let animationFrameId;
    
    const draw = () => {
      time++;
      
      // Interpolate Parallax Target for silky smooth movement
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;
      
      // True Pure Black Background
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Extremely subtle white/monochrome glowing galactic core
      const cx = width / 2;
      const cy = height / 2;
      const grad1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.7);
      grad1.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      grad1.addColorStop(0.5, 'rgba(255, 255, 255, 0.01)');
      grad1.addColorStop(1, 'transparent');
      
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      // Render Universe
      for (let star of stars) star.draw(time);
      for (let shootingStar of shootingStars) shootingStar.draw();

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
    />
  );
}
