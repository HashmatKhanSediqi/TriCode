import { withAdminAuth } from "../../../lib/auth";

export default withAdminAuth(
  async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).end();

    return res.status(200).json({
      authenticated: true,
      user: {
        id: req.user.userId,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    });
  },
  { requireCsrfForMutations: false },
);
