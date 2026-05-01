import { useNavigate } from 'react-router-dom'
import LoginForm from '../components/LoginForm'

export default function LoginPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#005a9f]">JUMP ORACLE</h1>
          <p className="text-slate-500 text-sm mt-1">
            Connectez-vous pour accéder à l'application
          </p>
        </div>
        <LoginForm onSuccess={() => navigate('/annuaire')} />
      </div>
    </div>
  )
}
