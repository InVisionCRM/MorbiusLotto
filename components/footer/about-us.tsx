import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface AboutUsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutUsModal({ open, onOpenChange }: AboutUsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border-white/20 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center mb-6">
            About Us
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            Welcome to Morbius.io — a community-driven gaming platform on PulseChain built for fun and connection.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Our Mission</h3>
          <p>
            To create a welcoming space for entertainment and community. We focus on fair, transparent gameplay and a great experience so players can relax, have fun, and connect with others.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">What We Offer</h3>
          <ul className="space-y-1 ml-4">
            <li>• Mega Morbius Lotto — 6/55 number draw for classic lottery-style fun</li>
            <li>• Crypto Keno — fast-paced number matching</li>
            <li>• Plinko — physics-based ball dropping</li>
            <li>• Secure wallet integration with PulseChain</li>
            <li>• A variety of games designed for entertainment and social play</li>
          </ul>

          <h3 className="text-lg font-semibold mt-6 mb-2">Our Technology</h3>
          <p>
            Built on PulseChain, our platform uses smart contracts to deliver fair, consistent gameplay and a secure experience. Results are verifiable so everyone can play with confidence.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Community First</h3>
          <p>
            We’re here to build a strong, friendly community around shared entertainment. Whether you’re here to unwind or to connect with other players, you’re welcome. Join the growing community that makes Morbius.io a place to play and belong.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Contact Us</h3>
          <p>
            Have questions or feedback? Reach out through our official channels — we’d love to hear from you.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}