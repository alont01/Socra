'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { StepIndicator } from '@/components/onboarding/StepIndicator'
import { Step1 } from '@/components/onboarding/steps/Step1'
import { Step2 } from '@/components/onboarding/steps/Step2'
import { Step3 } from '@/components/onboarding/steps/Step3'
import { Step4 } from '@/components/onboarding/steps/Step4'
import { Step5 } from '@/components/onboarding/steps/Step5'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

const STEP_LABELS = ['Welcome', 'Topics', 'Skills', 'Style', 'Your Plan']

interface ProfileData {
  name: string
  role: 'STUDENT' | 'PARENT'
  gradeLevel: string
  mathTopics: string[]
  strengthAreas: string[]
  weaknessAreas: string[]
  learningStyle: string
  goals: string
}

export default function OnboardingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user?.role === 'PARENT') {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<ProfileData>({
    name: user?.studentProfile?.name || '',
    role: (user?.role as 'STUDENT' | 'PARENT') || 'STUDENT',
    gradeLevel: '',
    mathTopics: [],
    strengthAreas: [],
    weaknessAreas: [],
    learningStyle: '',
    goals: '',
  })

  const handleChange = (field: string, value: string | string[]) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  const canAdvance = () => {
    if (step === 0) return profile.name.trim().length > 0
    if (step === 1) return profile.gradeLevel !== ''
    if (step === 2) return true
    if (step === 3) return profile.learningStyle !== ''
    return true
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return <Step1 name={profile.name} role={profile.role} onChange={handleChange} />
      case 1:
        return <Step2 gradeLevel={profile.gradeLevel} mathTopics={profile.mathTopics} onChange={handleChange} />
      case 2:
        return <Step3 strengthAreas={profile.strengthAreas} weaknessAreas={profile.weaknessAreas} onChange={handleChange} />
      case 3:
        return <Step4 learningStyle={profile.learningStyle} goals={profile.goals} onChange={handleChange} />
      case 4:
        return <Step5 profileData={profile} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col">
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="text-2xl font-bold text-orange-500">∑</span>
          <span className="text-xl font-bold text-stone-900">Socra</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <StepIndicator current={step} total={5} labels={STEP_LABELS} />

          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8">
            {renderStep()}

            {step < 4 && (
              <div className="flex gap-3 mt-8">
                {step > 0 && (
                  <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="flex-1">
                    ← Back
                  </Button>
                )}
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canAdvance()}
                  className="flex-1"
                >
                  {step === 3 ? 'Generate My Plan →' : 'Continue →'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
