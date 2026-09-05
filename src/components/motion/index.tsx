'use client';

import {m as motion, type HTMLMotionProps, type Variants} from 'framer-motion';
import {useState, type ComponentProps, type ReactNode} from 'react';

import {usePrefersReducedMotion} from '@/hooks/use-prefers-reduced-motion';
import {motionTokens} from '@/lib/motion';
import {cn} from '@/lib/utils';

const fadeInUp: Variants = {
  hidden: {opacity: 0, y: 18},
  visible: {opacity: 1, y: 0, transition: motionTokens.spring}
};

export function PageTransition({children, className}: {children: ReactNode; className?: string}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : {opacity: 0, y: 8}}
      animate={{opacity: 1, y: 0}}
      exit={reduced ? undefined : {opacity: 0, y: -6}}
      transition={{duration: motionTokens.duration.base, ease: motionTokens.easeOut}}
    >
      {children}
    </motion.div>
  );
}

export function FadeInUp({
  children,
  className,
  delay = 0,
  eager = false,
  ...props
}: HTMLMotionProps<'div'> & {children: ReactNode; delay?: number; eager?: boolean}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced || eager ? false : 'hidden'}
      whileInView="visible"
      viewport={{once: true, margin: '-64px'}}
      variants={fadeInUp}
      transition={{delay}}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerList({
  children,
  className,
  stagger = 0.06
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{once: true, margin: '-48px'}}
      variants={{hidden: {}, visible: {transition: {staggerChildren: reduced ? 0 : stagger}}}}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({children, className}: {children: ReactNode; className?: string}) {
  return (
    <motion.div className={className} variants={fadeInUp}>
      {children}
    </motion.div>
  );
}

export function HoverLift({children, className}: {children: ReactNode; className?: string}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : {y: -6, scale: 1.01}}
      whileTap={reduced ? undefined : {scale: 0.985}}
      transition={motionTokens.spring}
    >
      {children}
    </motion.div>
  );
}

export function TiltCard({
  children,
  className,
  intensity = 7
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [tilt, setTilt] = useState({x: 0, y: 0});
  return (
    <motion.div
      className={cn('motion-tilt', className)}
      animate={reduced ? undefined : {rotateX: tilt.x, rotateY: tilt.y}}
      transition={motionTokens.gentleSpring}
      onPointerMove={(event) => {
        if (reduced || event.pointerType === 'touch') return;
        const rect = event.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((event.clientY - rect.top) / rect.height - 0.5) * -intensity,
          y: ((event.clientX - rect.left) / rect.width - 0.5) * intensity
        });
      }}
      onPointerLeave={() => setTilt({x: 0, y: 0})}
    >
      {children}
    </motion.div>
  );
}

export function ShineSweep({children, className}: ComponentProps<'div'>) {
  return (
    <div className={cn('motion-shine', className)}>
      <span aria-hidden="true" />
      {children}
    </div>
  );
}
