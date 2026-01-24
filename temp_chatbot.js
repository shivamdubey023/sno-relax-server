module.exports = function(io) {
  console.log('Chatbot socket module loaded');
  io.on('connection', (socket) => {
    console.log('Chatbot socket connected:', socket.id);
    socket.on('chatbotMessage', (data) => {
      console.log('Received chatbot message:', data);
      socket.emit('chatbotResponse', { text: 'Test response', role: 'SnoRelax' });
    });
  });
};
