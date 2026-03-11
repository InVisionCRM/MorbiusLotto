"use client"

import type React from "react"
import { forwardRef } from "react"
import { Shader } from "react-shaders"
import { cn } from "~/lib/utils"

export interface RippleShadersProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Animation speed multiplier
   * @default 1.0
   */
  speed?: number

  /**
   * Ripple intensity and brightness
   * @default 1.0
   */
  intensity?: number

  /**
   * Color scheme for the ripples
   * @default [0.2, 0.6, 1.0]
   */
  colorScheme?: [number, number, number]

  /**
   * Number of ripple sources
   * @default 3
   */
  rippleCount?: number

  /**
   * Wave frequency multiplier
   * @default 1.0
   */
  frequency?: number
}

const fragmentShader = `
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalize coordinates to center origin
    vec2 uv = (2.0*fragCoord-iResolution.xy)/iResolution.y;

    // Time with speed control
    float time = iTime * u_speed;

    // Initialize ripple effect
    float ripple = 0.0;

    // Create multiple ripple sources based on rippleCount
    for(int i = 0; i < 5; i++) {
        if(float(i) >= u_rippleCount) break;

        // Calculate ripple source position using circular motion
        float angle = float(i) * 6.28318 / u_rippleCount + time * 0.3;
        vec2 source = vec2(cos(angle), sin(angle)) * 0.4;

        // Distance from current pixel to ripple source
        float dist = length(uv - source);

        // Create expanding ripple wave
        float wave = sin(dist * 15.0 * u_frequency - time * 4.0);

        // Apply distance-based attenuation
        float attenuation = 1.0 / (1.0 + dist * 3.0);

        // Add to total ripple effect
        ripple += wave * attenuation;
    }

    // Add central stationary ripple
    float centerDist = length(uv);
    float centerRipple = sin(centerDist * 20.0 * u_frequency - time * 5.0);
    float centerAttenuation = 1.0 / (1.0 + centerDist * 2.0);
    ripple += centerRipple * centerAttenuation * 0.5;

    // Apply intensity scaling
    ripple *= u_intensity;

    // Create interference patterns
    float interference = ripple * ripple;

    // Color calculation based on ripple intensity
    vec3 baseColor = u_colorScheme * 0.1;
    vec3 rippleColor = u_colorScheme * abs(ripple) * 0.8;
    vec3 interferenceColor = u_colorScheme * interference * 0.3;

    // Combine colors
    vec3 finalColor = baseColor + rippleColor + interferenceColor;

    // Add subtle glow effect
    float glow = exp(-centerDist * 1.5) * 0.2;
    finalColor += u_colorScheme * glow;

    // Apply gamma correction for better visual appearance
    finalColor = pow(finalColor, vec3(0.8));

    fragColor = vec4(finalColor, 1.0);
}
`

export const RippleShaders = forwardRef<HTMLDivElement, RippleShadersProps>(
  (
    {
      className,
      speed = 1.0,
      intensity = 1.0,
      colorScheme = [0.2, 0.6, 1.0],
      rippleCount = 3,
      frequency = 1.0,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn("w-full h-full", className)} ref={ref} {...(props as any)}>
        <Shader
          fs={fragmentShader}
          style={{ width: "100%", height: "100%" } as CSSStyleDeclaration}
          uniforms={{
            u_speed: { type: "1f", value: speed },
            u_intensity: { type: "1f", value: intensity },
            u_colorScheme: { type: "3fv", value: colorScheme },
            u_rippleCount: { type: "1f", value: rippleCount },
            u_frequency: { type: "1f", value: frequency },
          }}
        />
      </div>
    )
  },
)

RippleShaders.displayName = "RippleShaders"

export default RippleShaders
