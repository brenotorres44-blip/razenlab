/* Guia de filamentos Voolt3D — usado no painel (Estoque → Guia de filamentos).
   "fab" = faixa que a Voolt3D publica na página do produto (bico 0,4 mm, salvo onde diz outro).
   "ind" = ponto de partida indicado para a RazenLab dentro dessa faixa. Sempre vale uma torre de temperatura
   no primeiro rolo de cada cor. Cores = as que a loja lista; "hex" é só uma aproximação para a amostra na tela.
   Levantado em voolt3d.com.br em outubro de 2026. */
window.GUIA_FILAMENTOS = [
  {
    id: "pla-solida", material: "PLA", linha: "PLA Cores Sólidas", acabamento: "Brilho leve",
    ideal: "Peças do dia a dia, brindes, placas, protótipos",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "210 °C (1ª camada 215)", mesa: "55 °C", vent: "100% a partir da 3ª camada", fluxo: "20 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, só se estalar ou soltar fiapos" },
    dicas: ["Cores claras mostram mais as linhas de camada; preto e grafite escondem.", "Bom para peças de várias cores: troca limpa e pouca purga."],
    cores: [["Preto","#1a1a1a"],["Branco Dental","#f1efe6"],["Cinza Claro","#b9bcc0"],["Cinza Grafite","#4a4d52"],["Bege Caucasiano","#e8c9a8"],["Amarelo","#f5c518"],["Laranja","#f07a1a"],["Rosa","#f28bb6"],["Roxo","#7044a8"],["Azul","#1f5fbf"],["Azul Cyan","#19b5d8"],["Verde","#2e9b45"]]
  },
  {
    id: "pla-evo", material: "PLA", linha: "PLA Evo", acabamento: "Brilho leve",
    ideal: "Peças que levam esforço: suportes, ganchos, encaixes",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "215 °C", mesa: "55 °C", vent: "100% a partir da 3ª camada", fluxo: "22 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["Segundo a Voolt3D, tem mais aderência entre camadas que o PLA comum.", "Para peça resistente: 4 paredes e 25–40% de preenchimento valem mais que 100% de preenchimento."],
    cores: [["Preto","#1a1a1a"],["Branco Off White","#efe9dc"]]
  },
  {
    id: "pla-velvet", material: "PLA", linha: "PLA Velvet", acabamento: "Fosco aveludado",
    ideal: "Bonecos, figuras, decoração — esconde bem as camadas",
    fab: { bico: "205–220 °C", mesa: "70–75 °C", fluxo: "18–22 mm³/s" },
    ind: { bico: "215 °C", mesa: "60 °C", vent: "100% a partir da 3ª camada", fluxo: "16 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["A camada \"expande\" um pouco: se a superfície ficar áspera ou o encaixe apertar, baixe o fluxo 2–3%.", "Parede externa mais devagar deixa o fosco uniforme, sem faixas brilhantes.", "Faixa do fabricante tirada da ficha do Velvet vermelho; as outras cores podem variar."],
    cores: [["Preto","#1c1c1c"],["Branco","#f2f0ea"],["Off White","#ece4d4"],["Cinza Claro","#b7babd"],["Cinza Grafite","#46494d"],["Bege Caucasiano","#e6c6a3"],["Marrom","#6b4226"],["Marrom Cappuccino","#9a6a4a"],["Vermelho","#c4202a"],["Rosa Bebê","#f4bfd0"],["Amarelo","#f2c230"],["Azul","#2055b0"],["Verde","#2f8f48"],["Verde Oliva","#6b7a3a"]]
  },
  {
    id: "pla-macaron", material: "PLA", linha: "PLA Velvet Macaron", acabamento: "Fosco, tons pastel",
    ideal: "Infantil, festas, Páscoa, chá revelação, brindes delicados",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "210 °C", mesa: "60 °C", vent: "100% a partir da 3ª camada", fluxo: "16 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["Tons pastel ficam translúcidos em paredes finas: use pelo menos 3 paredes.", "Aceita lixa e tinta, segundo o fabricante."],
    cores: [["Lilás","#c9b3e6"],["Azul","#a9cdee"],["Amarelo","#f6e59a"],["Verde","#b7e2b8"],["Laranja","#f7c08f"]]
  },
  {
    id: "pla-silk", material: "PLA", linha: "PLA V-Silk", acabamento: "Seda, muito brilho",
    ideal: "Troféus, pódios, vasos, Natal (dourado), peças de vitrine",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "225 °C", mesa: "60 °C", vent: "80–100%", fluxo: "12–15 mm³/s (mais devagar = mais brilho)", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["O brilho aparece nas paredes: use 3 paredes e parede externa devagar.", "Grudam menos entre camadas que o PLA comum: evite para peças de esforço.", "Modo vaso (uma parede só) deixa o brilho perfeito."],
    cores: [["Dourado","#d4a92c"],["Dourado Ultra","#e0b13a"],["Inox","#a8acb0"],["Alumínio","#c3c6c9"],["Branco Pérola","#ede7dc"],["Vermelho","#b5121b"],["Rosa Choque","#e0207a"],["Azul Safira","#1f3f9e"],["Azul Titanium","#3b5f8a"],["Azul Sky","#5fb0e8"],["Verde","#1f8a4c"],["Verde Neon","#7be03a"],["Rosa Salmão Neon","#ff7f6e"]]
  },
  {
    id: "pla-tricolor", material: "PLA", linha: "PLA Tri Color (V-Silk)", acabamento: "Seda, 3 cores no mesmo fio",
    ideal: "Vasos, troféus, enfeites redondos, peças de destaque",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "225 °C", mesa: "60 °C", vent: "80–100%", fluxo: "12 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["As três cores correm lado a lado no fio: a cor que aparece muda com o ângulo e a direção da parede.", "Peças redondas e espirais mostram melhor o efeito; caixas retas ficam com faces de uma cor só.", "Costura (seam) alinhada atrás da peça para não quebrar o degradê.", "Faixa do fabricante igual à do V-Silk."],
    cores: [["Dourado / Rosa Choque / Verde","#d4a92c"],["Dourado / Laranja / Rosa Choque","#e88a2c"],["Bronze / Prata / Ouro","#b08d57"],["Ametista / Azul Safira / Dourado","#6a4fa8"],["Azul / Laranja / Verde Neon","#2f7fd0"],["Azul Safira / Dourado / Verde","#1f3f9e"]]
  },
  {
    id: "pla-duo", material: "PLA", linha: "PLA Duo Color Shadow (V-Silk)", acabamento: "Seda, 2 cores (70/30) com sombra",
    ideal: "Figuras, dragões, peças com textura e relevo",
    fab: { bico: "205–240 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s" },
    ind: { bico: "225 °C", mesa: "60 °C", vent: "80–100%", fluxo: "12–15 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["70% de uma cor e 30% da outra; o efeito muda conforme o ângulo de visão.", "Relevo e escamas realçam a sombra — ótimo para dragões e figuras."],
    cores: [["Vermelho com Preto","#a01820"],["Verde com Preto","#1f6b3a"],["Laranja com Preto","#c8641a"],["Rosa com Preto","#c43a7a"],["Dourado com Preto","#b08a2a"],["Azul com Preto","#1f4a9a"],["Azul Safira com Ametista","#3a3f9e"],["Verde com Ametista","#3a7a6a"],["Dourado com Verde","#a39a2a"],["Dourado com Ametista","#9a7a6a"]]
  },
  {
    id: "pla-stone", material: "PLA", linha: "PLA Stone", acabamento: "Fosco mineral (pedra, gesso, mármore)",
    ideal: "Vasos, esculturas, bustos, decoração de pedra",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s", bicoMin: "0,6 mm ou maior" },
    ind: { bico: "215 °C", mesa: "60 °C", vent: "100%", fluxo: "15 mm³/s", retr: "0,6 mm direto · 3 mm bowden", seca: "50 °C por 6 h, se precisar" },
    dicas: ["A Voolt3D pede bico de 0,6 mm ou maior por causa das partículas minerais.", "Bico de aço endurecido evita desgaste do bico de latão.", "Camada de 0,24–0,28 mm combina com o acabamento e imprime mais rápido."],
    cores: [["Crema Marfil","#e8dcc2"],["Verde Ardósia","#5d6f62"],["Grafite","#4b4d50"],["Marmorizado","#d9d6cf"],["Gesso","#efede7"]]
  },
  {
    id: "pla-wood", material: "PLA", linha: "PLA Wood", acabamento: "Madeira (com partículas)",
    ideal: "Porta-objetos, placas rústicas, decoração, brindes de madeira",
    fab: { bico: "190–230 °C", mesa: "50–70 °C", fluxo: "até 25 mm³/s", bicoMin: "0,6 mm ou maior" },
    ind: { bico: "205 °C", mesa: "55 °C", vent: "100%", fluxo: "12 mm³/s", retr: "0,6 mm direto · 3 mm bowden", seca: "50 °C por 6 h antes de usar" },
    dicas: ["A Voolt3D pede bico de 0,6 mm ou maior, senão entope.", "Temperatura mais alta escurece o tom (efeito queimado); mais baixa deixa mais claro.", "Aceita lixa; não deixe o bico parado quente com o filamento dentro."],
    cores: [["Pinus","#d2a86e"],["Tabaco","#8a5a32"],["Carvão","#3a2e28"]]
  },
  {
    id: "petg-hf", material: "PETG", linha: "PETG HF (alta fluidez)", acabamento: "Brilho",
    ideal: "Peças funcionais, ao sol, carro, ao ar livre, potes",
    fab: { bico: "220–250 °C", mesa: "70 °C", fluxo: "20 mm³/s" },
    ind: { bico: "240 °C", mesa: "70 °C (75 na 1ª camada)", vent: "30–50%", fluxo: "18 mm³/s", retr: "1 mm direto · 5 mm bowden, com Z-hop", seca: "65 °C por 6–8 h — sempre antes de usar" },
    dicas: ["Absorve umidade: rolo úmido dá bolhas, fios e peça fraca.", "Em mesa PEI lisa ou vidro use cola bastão, senão o PETG pode arrancar a superfície. PEI texturizada vai sem cola.", "Não esmague a 1ª camada: deixe o bico um pouco mais alto que no PLA.", "Aguenta mais calor que o PLA (amolece perto de 75 °C)."],
    cores: [["Preto","#1a1a1a"],["Branco Dental","#f0eee6"],["Cinza Claro","#b7babd"],["Cinza Grafite","#46494d"],["Vermelho","#c4202a"],["Laranja","#f07a1a"],["Amarelo","#f2c230"],["Azul","#1f5fbf"],["Verde","#2e9b45"],["Marrom","#6b4226"]]
  },
  {
    id: "petg-trans", material: "PETG", linha: "PETG HF Translúcido", acabamento: "Translúcido",
    ideal: "Luminárias, cúpulas, peças com luz por trás, potes",
    fab: { bico: "220–250 °C", mesa: "70 °C", fluxo: "20 mm³/s" },
    ind: { bico: "245–250 °C", mesa: "70 °C", vent: "10–30%", fluxo: "8–10 mm³/s (devagar)", retr: "1 mm direto · 5 mm bowden", seca: "65 °C por 8 h — obrigatório" },
    dicas: ["O branco leitoso vem de ar entre as linhas e de umidade: secar, imprimir quente e devagar ajuda.", "Transparência máxima pede ajuste próprio por peça (camadas, preenchimento e direção) — combinamos à parte.", "A Voolt3D diz que o Natural é \"food safe\"; isso vale para o material, não garante a peça impressa."],
    cores: [["Natural Translúcido","#dfe8ea"],["Verde Neon Translúcido","#9be45a"]]
  },
  {
    id: "abs", material: "ABS", linha: "ABS", acabamento: "Fosco leve, aceita lixa e acetona",
    ideal: "Peças que esquentam (carro, perto de motor), acabamento lixado",
    fab: { bico: "230–265 °C", mesa: "100–120 °C", fluxo: "até 20 mm³/s" },
    ind: { bico: "250 °C", mesa: "105 °C", vent: "0–15%", fluxo: "15 mm³/s", retr: "0,8 mm direto · 4 mm bowden", seca: "80 °C por 4 h" },
    dicas: ["Precisa de impressora fechada: sem câmara ele empena e racha entre camadas.", "Solta vapor com cheiro forte: imprima em lugar ventilado.", "Aguenta mais calor que PLA e PETG (amolece perto de 90 °C)."],
    cores: [["Preto","#1a1a1a"],["Branco Dental","#f0eee6"],["Natural","#efe6cf"],["Cinza Claro","#b7babd"],["Cinza Grafite","#46494d"],["Bege Caucasiano","#e6c6a3"],["Vermelho","#c4202a"],["Amarelo","#f2c230"],["Azul","#1f5fbf"],["Verde","#2e9b45"],["Marrom","#6b4226"]]
  },
  {
    id: "tpu", material: "TPU", linha: "TPU 95A (Elegoo, vendido pela Voolt3D)", acabamento: "Flexível, borrachudo",
    ideal: "Capinhas, pés antiderrapantes, pulseiras, amortecedores",
    fab: { bico: "210–240 °C (ideal 225)", mesa: "30–60 °C", fluxo: "20–60 mm/s (ideal 20–40)" },
    ind: { bico: "225 °C", mesa: "45 °C", vent: "50–100%", fluxo: "25–35 mm/s (≈ 3 mm³/s)", retr: "1 mm a 20 mm/s (o que o fabricante indica)", seca: "70 °C por 8 h" },
    dicas: ["Devagar é a regra: acima de 40 mm/s ele embola no extrusor.", "Funciona bem com extrusor direto; em bowden longo é difícil.", "Guarde fechado com sílica (umidade até 20%)."],
    cores: [["Preto","#1a1a1a"],["Branco","#f2f0ea"],["Cinza","#8a8d91"],["Natural Translúcido","#e6ecea"],["Vermelho","#c4202a"],["Azul","#1f5fbf"],["Verde","#2e9b45"]]
  }
];
