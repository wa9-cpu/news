const { listAgents } = require("./_pipeline");

module.exports = async (req, res) => {
  console.log(`[API] ${req.method} ${req.url}`);
  res.status(200).json({ agents: listAgents() });
};
