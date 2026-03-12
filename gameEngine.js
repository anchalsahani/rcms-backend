function assignRoles(players) {

  const roles = ["Raja","Mantri","Chor","Sipahi"];

  const shuffled = roles.sort(() => Math.random() - 0.5);

  return players.map((p,i) => ({
    ...p,
    role: shuffled[i]
  }));

}

module.exports = {
  assignRoles
};