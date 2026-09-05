import React, { useMemo } from 'react';
import { Typography } from 'antd';
import { MISIO_COLORS } from '../theme/misioTheme';

const { Text, Title } = Typography;

/**
 * TÓMBOLA DE BOLILLAS CON EFECTO "CHOCOLATEO" (Lottery Machine).
 * Simula una tómbola esférica 3D con corriente de aire: en reposo las bolillas flotan
 * suavemente al fondo, y al girar salen disparadas chocando de forma caótica en todas direcciones.
 */
export default function Roulette({ participants = [], activeCount = null, spinning = false, result = null, size = 340 }) {
  const numBalls = 45;

  const balls = useMemo(() => {
    const palette = [
      { main: '#ff3366', dark: '#800020', label: '#fff', text: '#000' }, // Rojo
      { main: '#00a2ff', dark: '#003d73', label: '#fff', text: '#000' }, // Azul Eléctrico
      { main: '#ffc107', dark: '#997300', label: '#fff', text: '#000' }, // Oro / Dorado
      { main: '#00e676', dark: '#006020', label: '#fff', text: '#000' }, // Esmeralda
      { main: '#a855f7', dark: '#4c1d95', label: '#fff', text: '#000' }, // Púrpura Misio
      { main: '#ffffff', dark: '#94a3b8', label: '#fff', text: '#000' }, // Blanco Perla
      { main: '#ff6b00', dark: '#803500', label: '#fff', text: '#000' }, // Naranja
    ];

    return Array.from({ length: numBalls }).map((_, i) => {
      const colorObj = palette[i % palette.length];
      const ballSize = 28 + (i % 5) * 2; // De 28px a 36px

      // Posición de reposo en el fondo (como si descansaran en la base de la tómbola)
      const idleTop = 60 + Math.random() * 24; // 60% a 84% de altura
      const idleLeft = 14 + Math.random() * 72; // 14% a 86% de ancho

      // Posición máxima de vuelo cuando se agita (chocolateo)
      const flightTop = 15 + Math.random() * 55; // Vuelan hasta la zona alta (15% a 70%)
      const flightLeft = 10 + Math.random() * 80;

      // Variables de trayectoria para la animación caótica
      const dx1 = (Math.random() - 0.5) * 160;
      const dy1 = -40 - Math.random() * 120;
      const dx2 = (Math.random() - 0.5) * 140;
      const dy2 = -20 - Math.random() * 100;
      const rot = -720 + Math.random() * 1440;
      const scaleBase = 0.75 + Math.random() * 0.4; // Efecto de profundidad 3D

      // Asignar un número real de participante o uno generado
      let ticketNum = Math.floor(1 + Math.random() * 999);
      if (participants.length && participants[i % participants.length]) {
        const p = participants[i % participants.length];
        ticketNum = p.ticketNumber || ticketNum;
      }
      const labelStr = String(ticketNum).padStart(3, '0');

      return {
        id: i,
        size: ballSize,
        colorObj,
        idleTop: `${idleTop}%`,
        idleLeft: `${idleLeft}%`,
        flightTop: `${flightTop}%`,
        flightLeft: `${flightLeft}%`,
        styleVars: {
          '--dx1': `${dx1}px`,
          '--dy1': `${dy1}px`,
          '--dx2': `${dx2}px`,
          '--dy2': `${dy2}px`,
          '--rot': `${rot}deg`,
          '--sc': scaleBase,
        },
        duration: 0.5 + Math.random() * 0.4, // Muy veloz: 0.5s a 0.9s por rebote
        idleDuration: 2.5 + Math.random() * 2, // Suave en reposo: 2.5s a 4.5s
        delay: (i % 10) * -0.1, // Desfase entre bolillas
        labelStr,
      };
    });
  }, [participants.length]); // Re-calcular si cambia la cantidad de participantes

  const isWinner = result?.result === 'winner';

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '15px 0' }}>
      <style>
        {`
          /* Vibración física de la máquina cuando el motor de aire está encendido */
          @keyframes tombola-shake {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(-3px, 1px) rotate(-0.6deg); }
            50% { transform: translate(3px, -2px) rotate(0.6deg); }
            75% { transform: translate(-2px, 2px) rotate(-0.4deg); }
          }

          /* CHOCOLATEO: Tormenta frenética en todas direcciones con rotación y escala 3D */
          @keyframes chocolateo-storm {
            0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
            33% { transform: translate(calc(-50% + var(--dx1)), calc(-50% + var(--dy1))) scale(var(--sc)) rotate(calc(var(--rot) * 0.33)); }
            66% { transform: translate(calc(-50% + var(--dx2)), calc(-50% + var(--dy2))) scale(calc(var(--sc) * 1.15)) rotate(calc(var(--rot) * 0.66)); }
            100% { transform: translate(-50%, -50%) scale(1) rotate(var(--rot)); }
          }

          /* REPOSO: Flotación suave como bolillas esperando en el aire de una tómbola */
          @keyframes tombola-idle-bob {
            0%, 100% { transform: translate(-50%, -50%) translateY(0px) rotate(0deg); }
            50% { transform: translate(-50%, -50%) translateY(-6px) rotate(8deg); }
          }

          /* Ráfaga de luz interior al girar */
          @keyframes inner-glow-pulse {
            0%, 100% { opacity: 0.2; transform: scale(0.95); }
            50% { opacity: 0.6; transform: scale(1.05); }
          }
        `}
      </style>

      {/* Contenedor de la Esfera Tómbola */}
      <div style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18) 0%, rgba(15, 23, 42, 0.85) 70%, rgba(0,0,0,0.95) 100%)',
        border: `7px solid ${MISIO_COLORS.primary}`,
        boxShadow: spinning ? `
          inset 0 0 60px rgba(0, 162, 255, 0.6),
          inset 20px 20px 45px rgba(255, 255, 255, 0.2),
          0 10px 35px rgba(0, 0, 0, 0.7),
          0 0 50px ${MISIO_COLORS.electricBlue}77
        ` : `
          inset 0 0 50px rgba(0, 0, 0, 0.8),
          inset 20px 20px 40px rgba(255, 255, 255, 0.12),
          0 10px 30px rgba(0, 0, 0, 0.6),
          0 0 35px ${MISIO_COLORS.primary}44
        `,
        overflow: 'hidden',
        animation: spinning ? 'tombola-shake 0.1s infinite linear' : 'none',
        transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
      }}>

        {/* Efecto de viento/turbulencia interna en movimiento */}
        {spinning && (
          <div style={{
            position: 'absolute',
            top: '20%', left: '20%',
            width: '60%', height: '60%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${MISIO_COLORS.electricBlue}44 0%, transparent 70%)`,
            animation: 'inner-glow-pulse 0.8s infinite ease-in-out',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        )}

        {/* BOLILLAS REALISTAS */}
        {balls.map((b) => {
          const isMoving = spinning;
          const animName = isMoving ? 'chocolateo-storm' : 'tombola-idle-bob';
          const animTime = isMoving ? b.duration : b.idleDuration;
          const animTiming = isMoving ? 'linear' : 'ease-in-out';
          const topPos = isMoving ? b.flightTop : b.idleTop;
          const leftPos = isMoving ? b.flightLeft : b.idleLeft;

          return (
            <div
              key={b.id}
              style={{
                position: 'absolute',
                top: topPos,
                left: leftPos,
                width: b.size,
                height: b.size,
                borderRadius: '50%',
                background: `radial-gradient(circle at 32% 28%, #fff 0%, ${b.colorObj.main} 50%, ${b.colorObj.dark} 95%)`,
                boxShadow: 'inset -3px -3px 8px rgba(0,0,0,0.6), 3px 4px 6px rgba(0,0,0,0.45)',
                transform: 'translate(-50%, -50%)',
                transition: isMoving ? 'top 0.3s ease, left 0.3s ease' : 'top 1.2s cubic-bezier(0.17, 0.88, 0.32, 1.2), left 1.2s ease, opacity 0.5s ease',
                display: 'grid',
                placeItems: 'center',
                zIndex: isMoving ? Math.floor(Math.random() * 8) + 1 : 2,
                opacity: result && !spinning ? 0.45 : 1,
                filter: result && !spinning ? 'blur(1px)' : 'none',
                ...b.styleVars,
                animation: `${animName} ${animTime}s infinite ${animTiming}`,
                animationDelay: `${b.delay}s`,
                pointerEvents: 'none',
              }}
            >
              {/* Parche blanco con el número del boleto al centro */}
              <div style={{
                width: b.size * 0.65,
                height: b.size * 0.65,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                display: 'grid',
                placeItems: 'center',
              }}>
                <span style={{
                  color: b.colorObj.text,
                  fontSize: b.size * 0.22,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  lineHeight: 1,
                }}>
                  {b.labelStr}
                </span>
              </div>
            </div>
          );
        })}

        {/* Brillo sobre el cristal (efecto reflejo esférico 3D) */}
        <div style={{
          position: 'absolute',
          top: '4%', left: '12%', width: '45%', height: '22%',
          background: 'linear-gradient(170deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.02) 100%)',
          borderRadius: '50%',
          transform: 'rotate(-20deg)',
          pointerEvents: 'none',
          zIndex: 9,
        }} />

        {/* BOLILLA GIGANTE DE RESULTADO (Ganador / Al Agua) */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: size * 0.78,
          height: size * 0.78,
          transform: `translate(-50%, -50%) scale(${result && !spinning ? 1 : 0})`,
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s',
          borderRadius: '50%',
          background: isWinner
            ? 'radial-gradient(circle at 35% 32%, #fff8d6 0%, #ffc107 45%, #a87000 85%, #4a3000 100%)'
            : 'radial-gradient(circle at 35% 32%, #e6f7ff 0%, #00a2ff 45%, #005691 85%, #002240 100%)',
          boxShadow: isWinner ? `
            inset -12px -12px 35px rgba(0,0,0,0.65), 
            inset 12px 12px 25px rgba(255,255,255,0.85),
            0 20px 45px rgba(0,0,0,0.9),
            0 0 65px rgba(255, 193, 7, 0.8)
          ` : `
            inset -12px -12px 35px rgba(0,0,0,0.65), 
            inset 12px 12px 25px rgba(255,255,255,0.85),
            0 20px 45px rgba(0,0,0,0.9),
            0 0 65px rgba(0, 162, 255, 0.8)
          `,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          {result && (
            <>
              <Text style={{
                fontSize: size * 0.045,
                fontWeight: 900,
                color: isWinner ? '#734600' : '#003a66',
                textTransform: 'uppercase',
                letterSpacing: 2,
                marginBottom: 6,
              }}>
                {isWinner ? '🏆 ¡BOLETO GANADOR! 🏆' : '💧 AL AGUA 💧'}
              </Text>

              <div style={{
                background: '#fff',
                padding: '6px 24px',
                borderRadius: 30,
                boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.15)',
                marginBottom: 10,
                border: `3px solid ${isWinner ? '#ffc107' : '#00a2ff'}`,
              }}>
                <Title level={2} style={{ margin: 0, color: '#111', fontSize: size * 0.13, letterSpacing: -1 }}>
                  #{String(result.ticketNumber).padStart(4, '0')}
                </Title>
              </div>

              <Text style={{
                fontSize: size * 0.055,
                fontWeight: 800,
                color: isWinner ? '#382200' : '#ffffff',
                textShadow: isWinner ? 'none' : '0 2px 4px rgba(0,0,0,0.6)',
                lineHeight: 1.15,
                padding: '0 10px',
              }}>
                {result.holderName || result.name || 'Participante'}
              </Text>
            </>
          )}
        </div>

        {/* Panel de información central en estado de reposo (sin girar y sin resultado activo) */}
        <div style={{
          position: 'absolute', top: '48%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 6,
          opacity: (spinning || result) ? 0 : 1,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
          background: 'rgba(11, 16, 30, 0.75)',
          padding: '12px 26px',
          borderRadius: 24,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
        }}>
          <Title level={2} style={{ margin: 0, color: 'white', fontWeight: 900 }}>{activeCount !== null ? activeCount : participants.length}</Title>
          <Text style={{ color: MISIO_COLORS.textMuted, fontSize: 13, fontWeight: 600 }}>
            Boletos en la<br/>Tómbola
          </Text>
        </div>
      </div>
    </div>
  );
}

